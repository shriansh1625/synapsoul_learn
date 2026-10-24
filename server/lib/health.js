export function healthResponse(database) {
  const ready = database?.db === 'ok'
  return {
    statusCode: ready ? 200 : 503,
    body: {
      status: ready ? 'ok' : 'unavailable',
      db: database?.db || 'error',
      llmTables: database?.llmTables || 'unknown',
      ...(database?.cliEventsTable ? { cliEventsTable: database.cliEventsTable } : {}),
      ...(!ready ? { dbError: 'Database temporarily unavailable' } : {}),
    },
  }
}
