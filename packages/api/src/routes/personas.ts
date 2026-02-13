import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import { createRouter, type AppEnv } from '../types.js';
import { CreatePersonaRequestSchema, UpdatePersonaRequestSchema } from '../schemas/requests.js';
import {
  ErrorResponseSchema,
  PersonaCreateResponseSchema,
  PersonaDeleteResponseSchema,
  PersonaDetailResponseSchema,
  PersonaListResponseSchema,
} from '../schemas/responses.js';

const PersonaSchemaIdParamSchema = z.object({
  personaSchemaId: z.string().min(1),
});

const listPersonasRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Personas'],
  summary: 'List all persona schemas',
  responses: {
    200: {
      description: 'List of persona schemas',
      content: {
        'application/json': {
          schema: PersonaListResponseSchema,
        },
      },
    },
  },
});

const createPersonaRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Personas'],
  summary: 'Create a new persona schema',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePersonaRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Persona created',
      content: {
        'application/json': {
          schema: PersonaCreateResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getPersonaRoute = createRoute({
  method: 'get',
  path: '/{personaSchemaId}',
  tags: ['Personas'],
  summary: 'Get persona schema details',
  request: {
    params: PersonaSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'Persona schema details',
      content: {
        'application/json': {
          schema: PersonaDetailResponseSchema,
        },
      },
    },
    404: {
      description: 'Persona not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const updatePersonaRoute = createRoute({
  method: 'put',
  path: '/{personaSchemaId}',
  tags: ['Personas'],
  summary: 'Update a persona schema',
  request: {
    params: PersonaSchemaIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdatePersonaRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated persona schema',
      content: {
        'application/json': {
          schema: PersonaDetailResponseSchema,
        },
      },
    },
    404: {
      description: 'Persona not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const deletePersonaRoute = createRoute({
  method: 'delete',
  path: '/{personaSchemaId}',
  tags: ['Personas'],
  summary: 'Delete a persona schema',
  request: {
    params: PersonaSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'Persona deleted',
      content: {
        'application/json': {
          schema: PersonaDeleteResponseSchema,
        },
      },
    },
    404: {
      description: 'Persona not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createPersonaRoutes(): OpenAPIHono<AppEnv> {
  const routes = createRouter();

  routes.openapi(listPersonasRoute, async (c) => {
    const { schemaRepository } = c.get('tenantRepos');
    const personas = await schemaRepository.listPersonaSchemas();

    return c.json(
      {
        personas: personas.map((p) => ({
          personaSchemaId: p.id,
          name: p.name,
          description: p.description,
          isActive: p.isActive,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
      },
      200,
    );
  });

  routes.openapi(createPersonaRoute, async (c) => {
    const body = c.req.valid('json');
    const { schemaRepository } = c.get('tenantRepos');

    const persona = await schemaRepository.savePersonaSchema({
      name: body.name,
      description: body.description,
      version: 1,
      config: body.config,
      isActive: true,
    });

    return c.json(
      {
        personaSchemaId: persona.id,
        name: persona.name,
        isActive: persona.isActive,
        createdAt: persona.createdAt.toISOString(),
      },
      201,
    );
  });

  routes.openapi(getPersonaRoute, async (c) => {
    const { personaSchemaId } = c.req.valid('param');
    const { schemaRepository } = c.get('tenantRepos');

    const persona = await schemaRepository.getPersonaSchema(personaSchemaId);
    if (!persona) {
      return c.json(
        {
          error: `Persona not found: ${personaSchemaId}`,
          code: 'PERSONA_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    return c.json(
      {
        personaSchemaId: persona.id,
        name: persona.name,
        description: persona.description,
        version: persona.version,
        isActive: persona.isActive,
        config: persona.config as unknown as Record<string, unknown>,
        createdAt: persona.createdAt.toISOString(),
        updatedAt: persona.updatedAt.toISOString(),
      },
      200,
    );
  });

  routes.openapi(updatePersonaRoute, async (c) => {
    const { personaSchemaId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { schemaRepository } = c.get('tenantRepos');

    try {
      const updated = await schemaRepository.updatePersonaSchema(personaSchemaId, {
        name: body.name,
        description: body.description,
        config: body.config,
        isActive: body.isActive,
      });

      return c.json(
        {
          personaSchemaId: updated.id,
          name: updated.name,
          description: updated.description,
          version: updated.version,
          isActive: updated.isActive,
          config: updated.config as unknown as Record<string, unknown>,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
        200,
      );
    } catch (error) {
      if (error instanceof PersistenceError && error.message.includes('not found')) {
        return c.json(
          {
            error: `Persona not found: ${personaSchemaId}`,
            code: 'PERSONA_NOT_FOUND',
            requestId: c.get('requestId'),
          },
          404,
        );
      }
      throw error;
    }
  });

  routes.openapi(deletePersonaRoute, async (c) => {
    const { personaSchemaId } = c.req.valid('param');
    const { schemaRepository } = c.get('tenantRepos');

    try {
      await schemaRepository.deletePersonaSchema(personaSchemaId);
      return c.json({ success: true as const }, 200);
    } catch (error) {
      if (error instanceof PersistenceError && error.message.includes('not found')) {
        return c.json(
          {
            error: `Persona not found: ${personaSchemaId}`,
            code: 'PERSONA_NOT_FOUND',
            requestId: c.get('requestId'),
          },
          404,
        );
      }
      throw error;
    }
  });

  return routes;
}
