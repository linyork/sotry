import express from 'express';
import cors from 'cors';
import blocksRouter from './routes/blocks';
import modelsRouter from './routes/models';
import settingsRouter from './routes/settings';
import chatRouter from './routes/chat';
import conversationsRouter from './routes/conversations';
import { getDb } from './db/index';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

getDb();

app.use('/api/blocks', blocksRouter);
app.use('/api/models', modelsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});
