import { Storage } from '@google-cloud/storage';

// Local dev: ADC (`gcloud auth application-default login`).
// Vercel: reader-SA key JSON pasted into GCP_SA_KEY env var (no ADC there).
export const storage = new Storage(
  process.env.GCP_SA_KEY ? { credentials: JSON.parse(process.env.GCP_SA_KEY) } : {},
);

export const BUCKET = process.env.GCS_BUCKET || 'oi-intraday-bucket';
