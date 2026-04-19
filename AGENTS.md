## General rules
- Less code with the same functionality is good and desired goal. Reduce code complexity if possible.

## Code style
 
- Every page should be under src/pages/PageName/index.tsx.
- Never extract the component props type as a separate interface.
- Never use arrow functions for named functions like React components. Use arrow functions as function arguments (e.g. useEffect, sort).
- We're actively using typescript `namespace`-s to group the code.

### Persistence
- Persistent entities follow naming ...Entity. e.g. 
  - ```typescript
    export interface FooEntity {
      id: string
      // ... other fields 
    }
    ```
  - Entity type is a separate type, exactly matching the persistent data layout. 
  - The conversion to and from entity type is a caller responsibility.
- Each entity has a repository interface with at least crud operations
  - ```typescript
    interface FooRepository {
        get(id: string): FooEntity
        save(entity: FooEntity): FooEntity
        update(entity: FooEntity): FooEntity
        getAll(): FooEntity[]
        delete(id: string): void
    }
    ```
