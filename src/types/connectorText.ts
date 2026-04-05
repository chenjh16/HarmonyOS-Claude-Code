export type ConnectorTextBlock = { type: 'connector_text'; text: string }
export function isConnectorTextBlock(b: unknown): b is ConnectorTextBlock { return false }
