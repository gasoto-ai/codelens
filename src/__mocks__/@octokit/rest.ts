// Manual mock for @octokit/rest — avoids ESM loading issues in Jest
export const Octokit = jest.fn()
