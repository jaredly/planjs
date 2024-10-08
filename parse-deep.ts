import fs from 'fs';

const data = fs.readFileSync('./fib.deep', 'utf8').trim().split('\n');
