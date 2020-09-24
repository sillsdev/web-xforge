module.exports = {
  packages: {
    '@angular-mdc/web': {
      ignorableDeepImportMatchers: [/@material\/progress-indicator\//, /@material\/ripple\/util/]
    },
    'ngx-avatar': {
      ignorableDeepImportMatchers: [/ts-md5\//]
    }
  }
};
