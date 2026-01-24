import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { OpxIamRoles } from '../constructs/iam-roles.js';
import { DetectionTable } from '../constructs/detection-table.js';
import { EvidenceGraphTable } from '../constructs/evidence-graph-table.js';
import { EvidenceBundleTable } from '../constructs/evidence-bundle-table.js';
import { AutomationAuditTable } from '../constructs/automation-audit-table.js';
import { OutcomeTable } from '../constructs/outcome-table.js';
import { ResolutionSummaryTable } from '../constructs/resolution-summary-table.js';
import { CalibrationTable } from '../constructs/calibration-table.js';
import { SnapshotTable } from '../constructs/snapshot-table.js';
import { PatternExtractionLambda } from '../constructs/pattern-extraction-lambda.js';
import { PatternExtractionSchedule } from '../constructs/pattern-extraction-schedule.js';
import { CalibrationLambda } from '../constructs/calibration-lambda.js';
import { CalibrationSchedule } from '../constructs/calibration-schedule.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * opx-control-plane Phase 1 Infrastructure
 * 
 * This stack implements the Incident Control Plane foundation:
 * - DynamoDB table for incidents (append-only timeline)
 * - EventBridge for audit events
 * - Lambda controller for deterministic state transitions
 * - API Gateway for human interface
 * 
 * NO AI/AGENTS/BEDROCK - Phase 1 is deterministic only.
 */
export class OpxControlPlaneStack extends cdk.Stack {
  public readonly incidentsTable: dynamodb.Table;
  public readonly signalsTable: dynamodb.Table;
  public readonly correlationRulesTable: dynamodb.Table;
  public readonly auditEventBus: events.EventBus;
  public readonly controllerFunction: lambda.Function;
  public readonly signalIngestorFunction: lambda.Function;
  public readonly alarmTopic: sns.Topic;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // DynamoDB: Idempotency Table (Permanent)
    // ========================================
    // CRITICAL INVARIANTS:
    // - "Idempotency records are audit artifacts, not caches."
    // - No TTL - records are permanent
    // - No cleanup jobs
    // - No overwrite paths
    
    const idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
      tableName: 'opx-idempotency',
      partitionKey: {
        name: 'idempotencyKey',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // NO TTL - records are permanent audit artifacts
    });

    // ========================================
    // DynamoDB: Incident Events Table (Authoritative Event Store)
    // ========================================
    // CRITICAL INVARIANTS:
    // - Events are facts. Facts are immutable.
    // - Event store is the only authoritative history.
    // - EventBridge is fan-out only, not source of truth.
    
    const incidentEventsTable = new dynamodb.Table(this, 'IncidentEventsTable', {
      tableName: 'opx-incident-events',
      partitionKey: {
        name: 'incidentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'eventSeq',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // GSI for querying by event type
    incidentEventsTable.addGlobalSecondaryIndex({
      indexName: 'gsi-eventType-timestamp',
      partitionKey: {
        name: 'eventType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // DynamoDB: Incidents Table
    // ========================================
    this.incidentsTable = new dynamodb.Table(this, 'IncidentsTable', {
      tableName: 'opx-incidents',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI for querying by state
    this.incidentsTable.addGlobalSecondaryIndex({
      indexName: 'gsi-state',
      partitionKey: {
        name: 'state',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updatedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying by service
    this.incidentsTable.addGlobalSecondaryIndex({
      indexName: 'gsi-service',
      partitionKey: {
        name: 'service',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // DynamoDB: Signals Table (Phase 2.1)
    // ========================================
    // CORRECTION 1: NO TTL - signals kept indefinitely
    // Required for:
    // - Replay verification (Phase 2.4)
    // - Historical correlation windows (Phase 2.2)
    // - Future learning (Phase 3+)
    // Manual archival/compaction tooling may be added in Phase 4+
    
    this.signalsTable = new dynamodb.Table(this, 'SignalsTable', {
      tableName: 'opx-signals',
      partitionKey: {
        name: 'signalId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // CORRECTION 1: No TTL in Phase 2.1
      // Automatic deletion is forbidden until learning phase exists
    });

    // GSI for querying signals by service + time
    this.signalsTable.addGlobalSecondaryIndex({
      indexName: 'ServiceObservedAtIndex',
      partitionKey: {
        name: 'service',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'observedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying signals by severity + time
    this.signalsTable.addGlobalSecondaryIndex({
      indexName: 'SeverityObservedAtIndex',
      partitionKey: {
        name: 'severity',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'observedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // EventBridge: Audit Event Bus
    // ========================================
    this.auditEventBus = new events.EventBus(this, 'AuditEventBus', {
      eventBusName: 'opx-audit-events',
    });

    // Archive all events for replay capability
    new events.Archive(this, 'AuditArchive', {
      sourceEventBus: this.auditEventBus,
      archiveName: 'opx-audit-archive',
      description: 'Immutable archive of all opx-control-plane audit events',
      retention: cdk.Duration.days(365),
      eventPattern: {
        source: [{ prefix: 'opx.' }] as any,
      },
    });

    // ========================================
    // Lambda: Incident Controller
    // ========================================
    const controllerLogGroup = new logs.LogGroup(this, 'ControllerLogGroup', {
      logGroupName: '/aws/lambda/opx-incident-controller',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Use NodejsFunction for proper ESM bundling
    this.controllerFunction = new nodejs.NodejsFunction(this, 'IncidentController', {
      functionName: 'opx-incident-controller',
      entry: path.join(__dirname, '../../src/controller/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        INCIDENTS_TABLE_NAME: this.incidentsTable.tableName,
        INCIDENT_EVENTS_TABLE_NAME: incidentEventsTable.tableName,
        IDEMPOTENCY_TABLE_NAME: idempotencyTable.tableName,
        AUDIT_EVENT_BUS_NAME: this.auditEventBus.eventBusName,
        NODE_OPTIONS: '--enable-source-maps',
        DEPLOY_TIMESTAMP: '2026-01-19T18:20', // Force redeploy for debugging
      },
      logGroup: controllerLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        // Bundle all dependencies (AWS SDK v3 is NOT in Node 18+ runtime)
        externalModules: [],
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
      },
    });

    // Grant permissions
    this.incidentsTable.grantReadWriteData(this.controllerFunction);
    incidentEventsTable.grantReadWriteData(this.controllerFunction);
    idempotencyTable.grantReadWriteData(this.controllerFunction);
    this.auditEventBus.grantPutEventsTo(this.controllerFunction);

    // ========================================
    // Phase 2.1: Signal Ingestion
    // ========================================

    // SNS Topic for CloudWatch Alarms
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'opx-cloudwatch-alarms',
      displayName: 'OPX CloudWatch Alarms',
    });

    // Lambda: Signal Ingestor
    const signalIngestorLogGroup = new logs.LogGroup(this, 'SignalIngestorLogGroup', {
      logGroupName: '/aws/lambda/opx-signal-ingestor',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.signalIngestorFunction = new nodejs.NodejsFunction(this, 'SignalIngestor', {
      functionName: 'opx-signal-ingestor',
      entry: path.join(__dirname, '../../src/signal/signal-ingestor.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        SIGNALS_TABLE_NAME: this.signalsTable.tableName,
        EVENT_BUS_NAME: this.auditEventBus.eventBusName,
        NODE_OPTIONS: '--enable-source-maps',
        DEPLOY_TIMESTAMP: '2026-01-19T18:07', // Force redeploy for debugging
      },
      logGroup: signalIngestorLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: [],
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
      },
    });

    // Grant permissions
    this.signalsTable.grantReadWriteData(this.signalIngestorFunction);
    this.auditEventBus.grantPutEventsTo(this.signalIngestorFunction);

    // Subscribe Lambda to SNS topic
    this.alarmTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(this.signalIngestorFunction)
    );

    // ========================================
    // Phase 2.2: Correlation Rules
    // ========================================

    // DynamoDB: Correlation Rules Table
    this.correlationRulesTable = new dynamodb.Table(this, 'CorrelationRulesTable', {
      tableName: 'opx-correlation-rules',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for querying enabled rules
    // Note: DynamoDB doesn't support BOOLEAN keys, so we use STRING ('true'/'false')
    this.correlationRulesTable.addGlobalSecondaryIndex({
      indexName: 'EnabledRulesIndex',
      partitionKey: {
        name: 'enabled',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'ruleId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // Phase 2.3: Incident Orchestration
    // ========================================

    // DynamoDB: Candidates Table
    const candidatesTable = new dynamodb.Table(this, 'CandidatesTable', {
      tableName: 'opx-candidates',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // DynamoDB: Promotion Decisions Table
    const promotionDecisionsTable = new dynamodb.Table(this, 'PromotionDecisionsTable', {
      tableName: 'opx-promotion-decisions',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI for querying decisions by decision type (Phase 3.3)
    promotionDecisionsTable.addGlobalSecondaryIndex({
      indexName: 'DecisionIndex',
      partitionKey: {
        name: 'decision',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'evaluatedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // DynamoDB: Orchestration Log Table (with 90-day TTL)
    const orchestrationLogTable = new dynamodb.Table(this, 'OrchestrationLogTable', {
      tableName: 'opx-orchestration-log',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl', // 90 days TTL for observability
    });

    // ========================================
    // Phase 2.2: Correlator Lambda (after candidates table exists)
    // ========================================

    // Lambda: Correlator (Phase 2.2)
    const correlatorLogGroup = new logs.LogGroup(this, 'CorrelatorLogGroup', {
      logGroupName: '/aws/lambda/opx-correlator',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const correlatorFunction = new nodejs.NodejsFunction(this, 'Correlator', {
      functionName: 'opx-correlator',
      entry: path.join(__dirname, '../../src/correlation/correlation-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        SIGNALS_TABLE_NAME: this.signalsTable.tableName,
        CORRELATION_RULES_TABLE_NAME: this.correlationRulesTable.tableName,
        CANDIDATES_TABLE_NAME: candidatesTable.tableName,
        EVENT_BUS_NAME: this.auditEventBus.eventBusName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: correlatorLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: [],
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
      },
      deadLetterQueueEnabled: true, // Mandatory DLQ
    });

    // Grant permissions to Correlator
    this.signalsTable.grantReadData(correlatorFunction);
    this.correlationRulesTable.grantReadData(correlatorFunction);
    candidatesTable.grantWriteData(correlatorFunction);
    this.auditEventBus.grantPutEventsTo(correlatorFunction);

    // EventBridge Rule: SignalIngested → Correlator (DISABLED)
    const signalIngestedRule = new events.Rule(this, 'SignalIngestedRule', {
      ruleName: 'opx-signal-ingested-to-correlator',
      eventBus: this.auditEventBus,
      eventPattern: {
        source: ['opx.signal'],
        detailType: ['SignalIngested'],
      },
      enabled: false, // DISABLED for safe deployment
    });

    signalIngestedRule.addTarget(
      new targets.LambdaFunction(correlatorFunction)
    );

    // ========================================
    // Phase 2.3: Candidate Processor Lambda
    // ========================================

    // Lambda: Candidate Processor (Phase 2.3 Step 4)
    const candidateProcessorLogGroup = new logs.LogGroup(this, 'CandidateProcessorLogGroup', {
      logGroupName: '/aws/lambda/opx-candidate-processor',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const candidateProcessorFunction = new nodejs.NodejsFunction(this, 'CandidateProcessor', {
      functionName: 'opx-candidate-processor',
      entry: path.join(__dirname, '../../src/orchestration/candidate-event-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CANDIDATES_TABLE_NAME: candidatesTable.tableName,
        PROMOTION_DECISIONS_TABLE_NAME: promotionDecisionsTable.tableName,
        INCIDENTS_TABLE_NAME: this.incidentsTable.tableName,
        INCIDENT_EVENTS_TABLE_NAME: incidentEventsTable.tableName,
        ORCHESTRATION_LOG_TABLE_NAME: orchestrationLogTable.tableName,
        EVENT_BUS_NAME: this.auditEventBus.eventBusName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: candidateProcessorLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: [],
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
      },
      deadLetterQueueEnabled: true, // Mandatory DLQ
    });

    // Grant permissions to Candidate Processor
    candidatesTable.grantReadData(candidateProcessorFunction);
    promotionDecisionsTable.grantReadWriteData(candidateProcessorFunction);
    this.incidentsTable.grantReadWriteData(candidateProcessorFunction);
    incidentEventsTable.grantReadWriteData(candidateProcessorFunction);
    orchestrationLogTable.grantWriteData(candidateProcessorFunction);
    this.auditEventBus.grantPutEventsTo(candidateProcessorFunction);

    // EventBridge Rule: CandidateCreated → Candidate Processor (DISABLED)
    const candidateCreatedRule = new events.Rule(this, 'CandidateCreatedRule', {
      ruleName: 'opx-candidate-created-to-processor',
      eventBus: this.auditEventBus,
      eventPattern: {
        source: ['opx.correlation'],
        detailType: ['CandidateCreated'],
      },
      enabled: false, // DISABLED for safe deployment
    });

    candidateCreatedRule.addTarget(
      new targets.LambdaFunction(candidateProcessorFunction)
    );

    // EventBridge Rule: IncidentCreated → Downstream (DISABLED, placeholder)
    new events.Rule(this, 'IncidentCreatedRule', {
      ruleName: 'opx-incident-created-to-downstream',
      eventBus: this.auditEventBus,
      eventPattern: {
        source: ['opx.orchestration'],
        detailType: ['IncidentCreated'],
      },
      enabled: false, // DISABLED for safe deployment
    });

    // ========================================
    // Phase 2.4: Detection & Evidence Infrastructure
    // ========================================

    // DynamoDB: Detection Table
    const detectionTable = new DetectionTable(this, 'DetectionTable', {
      tableName: 'opx-detections',
    });

    // DynamoDB: Evidence Graph Table
    const evidenceGraphTable = new EvidenceGraphTable(this, 'EvidenceGraphTable', {
      tableName: 'opx-evidence-graphs',
    });

    // DynamoDB: Evidence Bundle Table (Phase 3.1)
    const evidenceBundleTable = new EvidenceBundleTable(this, 'EvidenceBundleTable', {
      tableName: 'opx-evidence-bundles',
    });

    // Lambda: Detection Engine (Phase 2.4 Step 7.5)
    const detectionEngineLogGroup = new logs.LogGroup(this, 'DetectionEngineLogGroup', {
      logGroupName: '/aws/lambda/opx-detection-engine',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const detectionEngineFunction = new nodejs.NodejsFunction(this, 'DetectionEngine', {
      functionName: 'opx-detection-engine',
      entry: path.join(__dirname, '../../src/detection/detection-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DETECTIONS_TABLE_NAME: detectionTable.table.tableName,
        EVENT_BUS_NAME: this.auditEventBus.eventBusName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: detectionEngineLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        externalModules: [],
        banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        commandHooks: {
          beforeBundling() {
            return [];
          },
          beforeInstall() {
            return [];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [
              `cp -r ${inputDir}/src/detection/rules ${outputDir}/rules`,
            ];
          },
        },
      },
      deadLetterQueueEnabled: true, // Mandatory DLQ
    });

    // Grant permissions to Detection Engine
    detectionTable.grantWriteData(detectionEngineFunction);
    this.auditEventBus.grantPutEventsTo(detectionEngineFunction);

    // EventBridge Rule: SignalIngested → Detection Engine (DISABLED)
    const signalIngestedToDetectionRule = new events.Rule(this, 'SignalToDetectionEngineRule', {
      ruleName: 'opx-signal-to-detection-engine',
      eventBus: this.auditEventBus,
      eventPattern: {
        source: ['opx.signal'],
        detailType: ['SignalIngested'],
      },
      enabled: false, // DISABLED for safe deployment
    });

    signalIngestedToDetectionRule.addTarget(
      new targets.LambdaFunction(detectionEngineFunction)
    );

    // Update Correlator permissions to read from detection and evidence tables
    detectionTable.grantReadData(correlatorFunction);
    evidenceGraphTable.grantReadData(correlatorFunction);

    // Update Correlator environment variables
    correlatorFunction.addEnvironment('DETECTIONS_TABLE_NAME', detectionTable.table.tableName);
    correlatorFunction.addEnvironment('EVIDENCE_GRAPHS_TABLE_NAME', evidenceGraphTable.table.tableName);

    // ========================================
    // Phase 4: Post-Incident Learning Infrastructure
    // ========================================

    // DynamoDB: Incident Outcomes Table
    const outcomeTable = new OutcomeTable(this, 'OutcomeTable', {
      tableName: 'opx-incident-outcomes',
    });

    // DynamoDB: Resolution Summaries Table
    const resolutionSummaryTable = new ResolutionSummaryTable(this, 'ResolutionSummaryTable', {
      tableName: 'opx-resolution-summaries',
    });

    // DynamoDB: Confidence Calibrations Table
    const calibrationTable = new CalibrationTable(this, 'CalibrationTable', {
      tableName: 'opx-confidence-calibrations',
    });

    // DynamoDB: Learning Snapshots Table
    const snapshotTable = new SnapshotTable(this, 'SnapshotTable', {
      tableName: 'opx-learning-snapshots',
    });

    // ========================================
    // Phase 5: Automation Infrastructure
    // ========================================

    // DynamoDB: Automation Audit Table (Phase 5 Step 1)
    const automationAuditTable = new AutomationAuditTable(this, 'AutomationAuditTable', {
      tableName: 'opx-automation-audit',
    });

    // Lambda: Pattern Extraction Handler (Phase 5 Step 2)
    const patternExtractionLambda = new PatternExtractionLambda(this, 'PatternExtractionLambda', {
      outcomeTableName: outcomeTable.table.tableName,
      summaryTableName: resolutionSummaryTable.table.tableName,
      auditTableName: automationAuditTable.table.tableName,
    });

    // Grant permissions to Pattern Extraction Lambda
    outcomeTable.grantReadData(patternExtractionLambda.function);
    resolutionSummaryTable.grantReadWriteData(patternExtractionLambda.function);
    automationAuditTable.grantReadWriteData(patternExtractionLambda.function);

    // EventBridge: Pattern Extraction Schedules (Phase 5 Step 2)
    const patternExtractionSchedule = new PatternExtractionSchedule(
      this,
      'PatternExtractionSchedule',
      patternExtractionLambda.function
    );

    // Lambda: Calibration Handler (Phase 5 Step 3)
    const calibrationLambda = new CalibrationLambda(this, 'CalibrationLambda', {
      outcomeTableName: outcomeTable.table.tableName,
      calibrationTableName: calibrationTable.table.tableName,
      auditTableName: automationAuditTable.table.tableName,
      configTableName: 'opx-automation-config',
      // alertTopicArn will be added in Step 6
    });

    // Grant permissions to Calibration Lambda
    outcomeTable.grantReadData(calibrationLambda.function);
    calibrationTable.grantReadWriteData(calibrationLambda.function);
    automationAuditTable.grantReadWriteData(calibrationLambda.function);

    // EventBridge: Calibration Schedule (Phase 5 Step 3)
    const calibrationSchedule = new CalibrationSchedule(
      this,
      'CalibrationSchedule',
      { calibrationFunction: calibrationLambda.function }
    );

    // ========================================
    // API Gateway: Human Interface
    // ========================================
    this.api = new apigateway.RestApi(this, 'ControlPlaneApi', {
      restApiName: 'opx-control-plane-api',
      description: 'opx-control-plane API - Human interface for incident management',
      deployOptions: {
        stageName: 'v1',
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // Don't log request/response bodies
        metricsEnabled: true,
      },
      // CORS removed - API requires IAM authentication
      // Clients must use AWS SigV4 signing
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(this.controllerFunction, {
      proxy: true,
    });

    // IAM authorization required for all methods
    const iamAuthorization = {
      authorizationType: apigateway.AuthorizationType.IAM,
    };

    // /incidents
    const incidents = this.api.root.addResource('incidents');
    incidents.addMethod('POST', lambdaIntegration, iamAuthorization); // Create incident
    incidents.addMethod('GET', lambdaIntegration, iamAuthorization);  // List incidents

    // /incidents/{incidentId}
    const incident = incidents.addResource('{incidentId}');
    incident.addMethod('GET', lambdaIntegration, iamAuthorization);   // Get incident

    // /incidents/{incidentId}/transitions
    const transitions = incident.addResource('transitions');
    transitions.addMethod('POST', lambdaIntegration, iamAuthorization); // Request transition

    // /incidents/{incidentId}/approvals
    const approvals = incident.addResource('approvals');
    approvals.addMethod('POST', lambdaIntegration, iamAuthorization);   // Approve/reject

    // /incidents/{incidentId}/timeline
    const timeline = incident.addResource('timeline');
    timeline.addMethod('GET', lambdaIntegration, iamAuthorization);     // Get timeline

    // /incidents/{incidentId}/replay
    const replay = incident.addResource('replay');
    replay.addMethod('GET', lambdaIntegration, iamAuthorization);       // Replay incident

    // ========================================
    // IAM Roles
    // ========================================
    // CRITICAL: Pass explicit API ID and stage name for IAM policies.
    // Do NOT use arnForExecuteApi() - it generates patterns that don't
    // match actual API Gateway resource paths correctly.
    new OpxIamRoles(this, 'IamRoles', {
      apiId: this.api.restApiId,
      stageName: 'v1',
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'IncidentsTableName', {
      value: this.incidentsTable.tableName,
      description: 'DynamoDB incidents table name',
    });

    new cdk.CfnOutput(this, 'IncidentEventsTableName', {
      value: incidentEventsTable.tableName,
      description: 'DynamoDB incident events table name (authoritative event store)',
    });

    new cdk.CfnOutput(this, 'IdempotencyTableName', {
      value: idempotencyTable.tableName,
      description: 'DynamoDB idempotency table name (permanent audit artifacts)',
    });

    new cdk.CfnOutput(this, 'AuditEventBusName', {
      value: this.auditEventBus.eventBusName,
      description: 'EventBridge audit event bus name (fan-out only)',
    });

    new cdk.CfnOutput(this, 'SignalsTableName', {
      value: this.signalsTable.tableName,
      description: 'DynamoDB signals table name (Phase 2.1 - no TTL)',
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS topic ARN for CloudWatch alarms (Phase 2.1)',
    });

    new cdk.CfnOutput(this, 'SignalIngestorFunctionName', {
      value: this.signalIngestorFunction.functionName,
      description: 'Signal ingestor Lambda function name (Phase 2.1)',
    });

    new cdk.CfnOutput(this, 'CorrelationRulesTableName', {
      value: this.correlationRulesTable.tableName,
      description: 'DynamoDB correlation rules table name (Phase 2.2)',
    });

    new cdk.CfnOutput(this, 'CorrelatorFunctionName', {
      value: correlatorFunction.functionName,
      description: 'Correlator Lambda function name (Phase 2.2)',
    });

    new cdk.CfnOutput(this, 'CandidatesTableName', {
      value: candidatesTable.tableName,
      description: 'DynamoDB candidates table name (Phase 2.3)',
    });

    new cdk.CfnOutput(this, 'PromotionDecisionsTableName', {
      value: promotionDecisionsTable.tableName,
      description: 'DynamoDB promotion decisions table name (Phase 2.3)',
    });

    new cdk.CfnOutput(this, 'OrchestrationLogTableName', {
      value: orchestrationLogTable.tableName,
      description: 'DynamoDB orchestration log table name (Phase 2.3 - 90 day TTL)',
    });

    new cdk.CfnOutput(this, 'CandidateProcessorFunctionName', {
      value: candidateProcessorFunction.functionName,
      description: 'Candidate processor Lambda function name (Phase 2.3)',
    });

    // Phase 2.4 Outputs
    new cdk.CfnOutput(this, 'DetectionsTableName', {
      value: detectionTable.table.tableName,
      description: 'DynamoDB detections table name (Phase 2.4)',
    });

    new cdk.CfnOutput(this, 'EvidenceGraphsTableName', {
      value: evidenceGraphTable.table.tableName,
      description: 'DynamoDB evidence graphs table name (Phase 2.4)',
    });

    // Phase 3.1 Outputs
    new cdk.CfnOutput(this, 'EvidenceBundlesTableName', {
      value: evidenceBundleTable.table.tableName,
      description: 'DynamoDB evidence bundles table name (Phase 3.1)',
    });

    new cdk.CfnOutput(this, 'DetectionEngineFunctionName', {
      value: detectionEngineFunction.functionName,
      description: 'Detection engine Lambda function name (Phase 2.4)',
    });

    // Phase 4 Outputs
    new cdk.CfnOutput(this, 'OutcomeTableName', {
      value: outcomeTable.table.tableName,
      description: 'DynamoDB incident outcomes table name (Phase 4)',
    });

    new cdk.CfnOutput(this, 'ResolutionSummaryTableName', {
      value: resolutionSummaryTable.table.tableName,
      description: 'DynamoDB resolution summaries table name (Phase 4)',
    });

    new cdk.CfnOutput(this, 'CalibrationTableName', {
      value: calibrationTable.table.tableName,
      description: 'DynamoDB confidence calibrations table name (Phase 4)',
    });

    new cdk.CfnOutput(this, 'SnapshotTableName', {
      value: snapshotTable.table.tableName,
      description: 'DynamoDB learning snapshots table name (Phase 4)',
    });

    // Phase 5 Outputs
    new cdk.CfnOutput(this, 'AutomationAuditTableName', {
      value: automationAuditTable.table.tableName,
      description: 'DynamoDB automation audit table name (Phase 5)',
    });

    new cdk.CfnOutput(this, 'PatternExtractionFunctionName', {
      value: patternExtractionLambda.function.functionName,
      description: 'Pattern extraction Lambda function name (Phase 5 Step 2)',
    });

    new cdk.CfnOutput(this, 'DailyPatternExtractionRuleName', {
      value: patternExtractionSchedule.dailyRule.ruleName,
      description: 'Daily pattern extraction EventBridge rule name (Phase 5 Step 2)',
    });

    new cdk.CfnOutput(this, 'WeeklyPatternExtractionRuleName', {
      value: patternExtractionSchedule.weeklyRule.ruleName,
      description: 'Weekly pattern extraction EventBridge rule name (Phase 5 Step 2)',
    });

    new cdk.CfnOutput(this, 'CalibrationFunctionName', {
      value: calibrationLambda.function.functionName,
      description: 'Calibration Lambda function name (Phase 5 Step 3)',
    });

    new cdk.CfnOutput(this, 'MonthlyCalibrationRuleName', {
      value: calibrationSchedule.monthlyRule.ruleName,
      description: 'Monthly calibration EventBridge rule name (Phase 5 Step 3)',
    });
  }
}
