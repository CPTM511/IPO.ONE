import test from 'node:test';
import assert from 'node:assert/strict';
import {assertB4HostedMigrationBoundary} from '../../../scripts/b4-hosted-local-migration.mjs';
test('B4-H test migration admits only a loopback database or the exact existing CI service; private networks are not an allowlist',()=>{
 const base={name:'ipo_one_b4h_boundary_test',address:'127.0.0.1',connectionString:'postgresql://127.0.0.1:5432/ipo_one_b4h_boundary_test',env:{}};
 assert.doesNotThrow(()=>assertB4HostedMigrationBoundary(base));
 const container='a'.repeat(64),env={CI:'true',IPO_ONE_B4H_TEST_POSTGRES_CONTAINER:container};
 const inspectDocker=(command,args)=>{
   assert.equal(command,'docker');assert.deepEqual(args,['inspect','--format','{{json .NetworkSettings.Networks}}',container]);
   return JSON.stringify({existing_service:{IPAddress:'172.18.0.2',GlobalIPv6Address:''}});
 };
 assert.doesNotThrow(()=>assertB4HostedMigrationBoundary({...base,address:'172.18.0.2',env,inspectDocker}));
 for(const override of [{name:'production'},{connectionString:'postgresql://remote.example/test'},{address:'172.18.0.3'},{env:{}},{env:{CI:'true',IPO_ONE_B4H_TEST_POSTGRES_CONTAINER:'unreviewed-service'}}])
   assert.throws(()=>assertB4HostedMigrationBoundary({...base,address:'172.18.0.2',env,inspectDocker,...override}),/explicitly isolated local test/);
});
