import { GatewayPolicies } from '../../common/gateway/authorization';
import { GatewayApplication } from '../../common/gateway/gateway-application';
import { RealtimeServer } from '../../common/realtime-server';
import { createSFGatewayPolicies } from './sf-gateway-policies';
import { SF_GATEWAY_PROTOCOL } from './sf-gateway-protocol';

/** Scripture Forge's gateway setup: what its client sends, and its access policies. */
const SF_GATEWAY_APPLICATION: GatewayApplication = {
  protocol: SF_GATEWAY_PROTOCOL,
  createPolicies: (server: RealtimeServer): GatewayPolicies => createSFGatewayPolicies(server)
};

export default SF_GATEWAY_APPLICATION;
