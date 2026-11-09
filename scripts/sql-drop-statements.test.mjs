import test from 'node:test';import assert from 'node:assert/strict';
import {droppedSqlObjects} from './sql-drop-statements.mjs';
test('Rollback coverage recognizes actual grouped/individual drops and rejects comments or wrong objects',()=>{
 assert.deepEqual([...droppedSqlObjects('DROP TABLE a, b; DROP TABLE IF EXISTS c;','TABLE')],['a','b','c']);
 assert.deepEqual([...droppedSqlObjects('DROP FUNCTION f(TEXT, BIGINT); DROP FUNCTION IF EXISTS g();','FUNCTION')],['f','g']);
 assert.equal(droppedSqlObjects('-- DROP TABLE missing;\n/* DROP TABLE fake; */ DROP INDEX missing;','TABLE').size,0);
 assert.equal(droppedSqlObjects('ALTER TABLE a DROP COLUMN b;','TABLE').size,0);
 assert.equal(droppedSqlObjects('DROP TABLE a CASCADE;','TABLE').has('a'),true);
});
