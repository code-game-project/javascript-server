# javascript-server

![CodeGame Version](https://img.shields.io/badge/CodeGame-v0.8-orange)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D%20v14.0-brightgreen)

This is the JavaScript (and TypeScript) server library for CodeGame.

## Environment Variables

The following variables are over **overrides**. Game-specific defaults can be set using code.

- CG_MAX_GAME_COUNT: Overrides the default maximum game count per server. The default is `500`. The minimum is `1`.
- CG_MAX_PLAYER_COUNT: Overrides the default maximum player count per game. The default is `5`. The minimum is `1`.
- CG_MAX_INACTIVE_TIME: Overrides the default maximum time in minutes that a player is allowed to be in a game without at least one socket controlling it. The default is `10` minutes. When all players in a game are inactive the game is deleted automatically.
- CG_HEARTBEAT_INTERVAL: Overrides the default time between WebSocket pings. The default is `10 * 60` seconds.

## License

MIT License

Copyright (c) 2022 CodeGame Contributors (https://github.com/orgs/code-game-project/people)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
