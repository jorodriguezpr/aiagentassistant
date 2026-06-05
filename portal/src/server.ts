import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { CONFIG } from './config';
import { authRouter } from './routes/auth';
import { settingsRouter } from './routes/settings';
import { serviceRouter } from './routes/service';
import { usersRouter } from './routes/users';
import { logsRouter } from './routes/logs';
import { tokenUsageRouter } from './routes/tokenUsage';
import { credentialsRouter } from './routes/credentials';
import { nlscriptsRouter } from './routes/nlscripts';
import { playbooksRouter } from './routes/playbooks';
import { scheduledTasksRouter } from './routes/scheduledTasks';
import { emailAccountsRouter } from './routes/emailAccounts';
import { tasksRouter } from './routes/tasks';
import { chatRouter } from './routes/chat';
import { requireAuth } from './middleware/auth';

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Public
app.use('/api/auth', authRouter);

// Protected
app.use('/api/settings',        requireAuth, settingsRouter);
app.use('/api/service',         requireAuth, serviceRouter);
app.use('/api/users',           requireAuth, usersRouter);
app.use('/api/logs',            requireAuth, logsRouter);
app.use('/api/token-usage',     requireAuth, tokenUsageRouter);
app.use('/api/credentials',     requireAuth, credentialsRouter);
app.use('/api/nlscripts',       requireAuth, nlscriptsRouter);
app.use('/api/playbooks',       requireAuth, playbooksRouter);
app.use('/api/scheduled-tasks', requireAuth, scheduledTasksRouter);
app.use('/api/email-accounts',  requireAuth, emailAccountsRouter);
app.use('/api/tasks',           requireAuth, tasksRouter);
app.use('/api/chat',            requireAuth, chatRouter);

// Serve pages
app.get('/dashboard',    (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html')));
app.get('/totp-verify',  (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'totp-verify.html')));
app.get('/totp-setup',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'totp-setup.html')));
app.get('/',             (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));

app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`[Portal] Admin portal running on port ${CONFIG.PORT}`);
});
