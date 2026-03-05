# Backend Modular Architecture

```
src
|-- main.ts
|-- app.module.ts
|-- core
|   |-- config
|   |-- database
|   `-- logger
|-- common
|   |-- constants
|   |-- decorators
|   |-- dto
|   |-- exceptions
|   |-- guards
|   |-- interceptors
|   |-- pipes
|   `-- utils
`-- modules
    |-- health
    |   |-- controllers
    |   |-- services
    |   |-- dto
    |   |-- entities
    |   `-- repositories
    |-- auth
    |   |-- controllers
    |   |-- services
    |   |-- dto
    |   |-- entities
    |   `-- repositories
    `-- users
        |-- controllers
        |-- services
        |-- dto
        |-- entities
        `-- repositories
```

Principles:
- `modules/*`: Business domains, each domain owns controller/service/repository.
- `common/*`: Shared cross-cutting code reused by all modules.
- `core/*`: Infrastructure and app-level technical concerns.
