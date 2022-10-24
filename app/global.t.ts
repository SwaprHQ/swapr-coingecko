import { RequestInfo, RequestInit, Response } from 'node-fetch'

declare global {
  function fetch(url: RequestInfo, init?: RequestInit): Promise<Response>
}
