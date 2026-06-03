const bcrypt = require('bcryptjs');

async function hashPasswords() {
  const admin = await bcrypt.hash('admin123', 10);
  const student = await bcrypt.hash('student123', 10);
  
  console.log('Admin password hash:');
  console.log(admin);
  console.log('\nStudent password hash:');
  console.log(student);
}

hashPasswords();