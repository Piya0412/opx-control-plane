import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface KnowledgeCorpusBucketProps {
  /**
   * Bucket name (optional, auto-generated if not provided)
   */
  bucketName?: string;

  /**
   * Enable versioning (default: true)
   */
  versioned?: boolean;

  /**
   * Lifecycle policy for archived documents (default: Glacier after 90 days)
   */
  lifecycleRules?: s3.LifecycleRule[];
}

/**
 * S3 bucket for knowledge corpus storage.
 * 
 * Features:
 * - Versioning enabled (immutability guarantee)
 * - Encryption at rest (AWS managed)
 * - Lifecycle policies (Glacier for archived docs)
 * - No public access
 * - Retain on delete (preserve knowledge)
 */
export class KnowledgeCorpusBucket extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: KnowledgeCorpusBucketProps = {}) {
    super(scope, id);

    // Default lifecycle rules
    const defaultLifecycleRules: s3.LifecycleRule[] = [
      {
        id: 'archive-old-versions',
        enabled: true,
        noncurrentVersionTransitions: [
          {
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.days(90),
          },
        ],
      },
    ];

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      versioned: props.versioned !== false, // Default: true
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Never delete knowledge
      lifecycleRules: props.lifecycleRules || defaultLifecycleRules,
      enforceSSL: true,
    });

    // Output bucket name
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Knowledge corpus S3 bucket name',
      exportName: 'KnowledgeCorpusBucketName',
    });

    // Output bucket ARN
    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'Knowledge corpus S3 bucket ARN',
      exportName: 'KnowledgeCorpusBucketArn',
    });
  }
}
