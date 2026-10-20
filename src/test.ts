import Gyro from './gyro.js';

// Minimal embed-API smoke test. Run after building with `npm run example`.
const result = await Gyro.runFile('examples/hello.gyro');
console.log('Gyro program returned:', result);
