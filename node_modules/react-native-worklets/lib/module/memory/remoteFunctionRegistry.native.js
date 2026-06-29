/* eslint-disable @typescript-eslint/no-unsafe-function-type */
'use strict';

const remoteFunctionRegistry = new Map();
export let nextRemoteFunctionId = 1;
export function registerRemoteFunction(fun) {
  const id = nextRemoteFunctionId++;
  remoteFunctionRegistry.set(id, fun);
  return id;
}
globalThis.__remoteFunctionRegistry = remoteFunctionRegistry;
//# sourceMappingURL=remoteFunctionRegistry.native.js.map