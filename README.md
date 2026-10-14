# EventsStore

NestJS backend (port 4000) stores events in `backend/data/events.json`; Next.js + shadcn frontend (port 4002) shows them.

```
npm run install:all   # once
npm run dev           # runs both
```

## API
| Method | Path | |
|---|---|---|
| POST | `/event` | store any JSON body → `{ id, createdAt, body }`. Send a JSON array to store a batch: each item becomes its own event and an array is returned |
| GET | `/event` | list all (newest first) |
| GET | `/event/:id` | one event |
| DELETE | `/event/:id` | delete one |
| DELETE | `/event?ids=a,b` | delete several |
| DELETE | `/event` | clear all |
