// A Web Worker that runs one race (racing.ts), so the page stays
// responsive: it gets a RaceRequest, and posts progress, then the result
// (or why the race couldn't run).  races.ts starts it; cancelling a race
// ends the worker.

import { describeError, race } from './racing';
import type { RaceMessage, RaceRequest } from './races';

// The worker's global scope, as much of it as is used.  (The project's
// types are the page's, where `self` is a window.)
const scope = self as unknown as {
	postMessage(message: RaceMessage): void;
	onmessage: ((event: MessageEvent<RaceRequest>) => void) | null;
};

scope.onmessage = (event): void => {
	const { racer, seed, count } = event.data;
	try {
		const result = race(racer, seed, {
			count,
			onProgress: (done, of): void => {
				scope.postMessage({ kind: 'progress', done, count: of });
			}
		});
		scope.postMessage({ kind: 'done', result });
	} catch (e) {
		scope.postMessage({ kind: 'error', message: describeError(e) });
	}
};
