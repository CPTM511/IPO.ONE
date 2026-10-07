import { fileURLToPath } from "node:url";
import { assertProductUiBaseline } from "../apps/tenant-api/src/product-ui-baseline.js";
const root = fileURLToPath(new URL("../apps/web/src/", import.meta.url));
console.log(`Product UI baseline verified: ${assertProductUiBaseline(root)}`);
