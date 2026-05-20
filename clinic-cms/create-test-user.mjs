import bcrypt from 'bcryptjs';
import { promisify } from 'node:util';
import { db } from 'mysql2/promise';

const hash = promisify(bcrypt.hash);

// Create a test user with proper bcrypt hashing
async function createTestUser() {
  try {
    // Hash the password
    const password = 'password123';
    const hashedPassword = await hash(password, 10);
    
    console.log('Test User Credentials:');
    console.log('Email: admin@maxdiagnostics.com');
    console.log('Password: password123');
    console.log('Hashed Password:', hashedPassword);
    
    // The hashed password to use in SQL
    console.log('\nUse this hashed password in the database:');
    console.log(hashedPassword);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

createTestUser();
