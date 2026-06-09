import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

type Queryable = Pool | PoolClient;

export async function pquery<TResult extends QueryResultRow = QueryResultRow>(
  queryable: Queryable,
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<TResult>> {
  return queryable.query<TResult>(sql, params);
}
