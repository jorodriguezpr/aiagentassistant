import { Router, Request, Response } from 'express';
import { listUsers, createUser, changePassword, deleteUser } from '../utils/userStore';
import { requireAdmin } from '../middleware/auth';

export const usersRouter = Router();

// All user management requires admin role
usersRouter.use(requireAdmin);

usersRouter.get('/', (_req: Request, res: Response) => {
  res.json(listUsers());
});

usersRouter.post('/', async (req: Request, res: Response) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }
  try {
    const user = await createUser(String(username), String(password), role || 'admin');
    res.status(201).json(user);
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

usersRouter.put('/:username/password', async (req: Request, res: Response) => {
  const { password } = req.body || {};
  if (!password) { res.status(400).json({ error: 'password required' }); return; }
  const ok = await changePassword(req.params.username, String(password));
  if (!ok) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});

usersRouter.delete('/:username', (req: Request, res: Response) => {
  // Prevent deleting yourself
  if (req.params.username === req.user!.username) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }
  const ok = deleteUser(req.params.username);
  if (!ok) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});
