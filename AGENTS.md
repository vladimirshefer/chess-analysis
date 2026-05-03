## General rules
- Think before writing code.
- Less code with the same functionality is good and desired goal. Reduce code complexity if possible.

## Code style
 
- Every page should be under src/pages/PageName/index.tsx.
- Shared components should be placed in src/components/ComponentName.tsx.
- Shared business-logic should be wrapped in a namespace and placed in src/lib/NamespaceName.ts
- Never extract the component props type as a separate interface.
- Never use syntax like `const name = () => /*some code*/}` - use named functions instead.
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
