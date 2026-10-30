// Resolves when the page's own opening (the counter sheet or the home greeting) has lifted, so the first
// headings on screen play their reveal where it can be seen instead of behind the preloader.
let done;
export const pageReady = new Promise((resolve) => { done = resolve; });
export const markPageReady = () => done();
