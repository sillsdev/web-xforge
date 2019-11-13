/**
 * @name JavaScript import relative to project root
 * @description For consistency, imports should be relative to the current file, rather than the project root.
 * @kind problem
 * @problem.severity recommendation
 * @precision high
 * @id js/import-relative-to-project-root
 * @tags maintainability
 */

import javascript

from ImportDeclaration id
where id.getImportedPath().getComponent(0) = "src"
select id.getImportedPath(), "JavaScript import relative to project root, rather than current file"
