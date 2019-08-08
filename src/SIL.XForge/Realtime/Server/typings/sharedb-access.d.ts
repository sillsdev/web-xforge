declare module 'sharedb-access' {
  import ShareDB = require('sharedb');

  function ShareDBAccess(backend: ShareDB, options?: any): void;
  export = ShareDBAccess;
}
