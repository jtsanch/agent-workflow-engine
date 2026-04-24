import type { FastifyInstance } from "fastify";
import type { SearchService } from "../../services/search-service.js";

export function registerSearchController(app: FastifyInstance, searchService: SearchService): void {
  app.get<{ Querystring: { query?: string; zipcode?: string; stores?: string; category?: string } }>("/search", async (request) => {
    const item = await searchService.search({
      query: request.query.query,
      zipcode: request.query.zipcode,
      stores: request.query.stores,
      category: request.query.category
    });

    return { item };
  });
}
