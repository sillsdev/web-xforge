import { Db } from 'mongodb';
import { RealtimeServer } from '../realtime-server';
import { GatewayPolicies } from './authorization';
import { GatewayProtocolConfig } from './protocol-config';

/**
 * What an application (such as scriptureforge) provides to run the gateway in front of its realtime server: what its
 * client sends, and its access policies. common/index.ts loads it from `<appModuleName>/gateway/gateway-application`,
 * as it loads the application's RealtimeServer.
 */
export interface GatewayApplication {
  readonly protocol: GatewayProtocolConfig;
  createPolicies(server: RealtimeServer, db: Db): GatewayPolicies;
}
