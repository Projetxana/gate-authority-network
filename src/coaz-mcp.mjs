export function mapMcpDeleteToAuthzen({ actor, customerId, accessToken }) {
  return {
    subject: { type: 'agent', id: actor },
    action: { name: 'delete_customer_data', properties: { protocol: 'mcp', tool: 'delete_customer_data' } },
    resource: { type: 'customer', id: customerId },
    context: { protocol: 'mcp', access_token: accessToken }
  };
}
