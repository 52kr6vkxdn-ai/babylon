import { greet } from "./utils.js";
const el = document.getElementById("output");
el.innerText = greet();

// Intentional Error to demo error mapping:
// console.log(nonExistentVariable);