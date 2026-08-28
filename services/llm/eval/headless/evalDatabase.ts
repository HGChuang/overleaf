import mongoose from 'mongoose'
import { dbConfig } from '../../config/db.js'

type ConnectDatabase = (
  uri: string,
  options: typeof dbConfig.options
) => Promise<unknown>

export async function connectEvalDatabase(
  connect: ConnectDatabase = (uri, options) => mongoose.connect(uri, options)
): Promise<void> {
  // The production connector exits the process on failure. Evaluation must let
  // the rejection reach the runner so it can append a structured trial_failed.
  await connect(dbConfig.uri, dbConfig.options)
}
