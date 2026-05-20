import bcrypt from 'bcryptjs';
import { promisify } from 'node:util';

const hashPassword = promisify(bcrypt.hash);

const password = 'test123';
const hash = await hashPassword(password, 10);
console.log(hash);
