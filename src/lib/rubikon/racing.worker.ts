// A Web Worker that runs one race (racing.ts), so the page stays
// responsive: it gets a RaceRequest, and posts progress, then the result
// (or why the race couldn't run).  races.ts starts it; cancelling a race
// ends the worker.

import { race } from './racing';
import type { RaceMessage, RaceRequest } from './races';

// The worker's global scope, as much of it as is used.  (The project's
// types are the page's, where `self` is a window.)
const scope = self as unknown as {
	postMessage(message: RaceMessage): void;
	onmessage: ((event: MessageEvent<RaceRequest>) => void) | null;
};

// Progress is posted every few cubes, and after the last.
const PROGRESS_EVERY = 5;

scope.onmessage = (event): void => {
	const { racer, seed, count } = event.data;
	try {
		const result = race(racer, seed, {
			count,
			onProgress: (done, of): void => {
				if (done % PROGRESS_EVERY === 0 || done === of) {
					scope.postMessage({ kind: 'progress', done, count: of });
				}
			}
		});
		scope.postMessage({ kind: 'done', result });
	} catch (e) {
		const message =
			e instanceof Error && 'where' in e && typeof e.where === 'string' && e.where !== ''
				? `${e.where}: ${e.message}`
				: e instanceof Error
					? e.message
					: String(e);
		scope.postMessage({ kind: 'error', message });
	}
};
