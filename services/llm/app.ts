// src/app.js
import settings from '@overleaf/settings';
import connectDB from './config/db.js';
import { createServer } from './app/server.js';

await connectDB();

const { server } = await createServer();
server.listen(settings.PORT, settings.LISTEN_ADDRESS, () => {
  console.log(`server running on ${settings.PORT}`);
});


