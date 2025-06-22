// const response = await fetch('/chat/stream', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ query: "What's my schedule?", sessionId: "optional" })
// });

// const reader = response.body.getReader();
// const decoder = new TextDecoder();

// while (true) {
//     const { done, value } = await reader.read();
//     if (done) break;

//     const chunk = decoder.decode(value);
//     const lines = chunk.split('\n');

//     for (const line of lines) {
//         if (line.startsWith('data: ')) {
//             const event = JSON.parse(line.slice(6));
//             handleEvent(event);
//         }
//     }
// }

// const response = await fetch('/chat', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ query: "What's my schedule?", sessionId: "optional" })
// });
// const data = await response.json();