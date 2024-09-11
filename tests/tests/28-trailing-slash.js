// must support trailing slash in routes

import express from "express";

const app = express();

app.get('/test', (req, res) => {
    res.send('test');
});

app.listen(13333, async () => {
    console.log('Server is running on port 13333');

    let res = await fetch('http://localhost:13333/test');
    console.log(await res.text());

    res = await fetch('http://localhost:13333/test/');
    console.log(await res.text());

    res = await fetch('http://localhost:13333/test/test');
    console.log(await res.text());

    process.exit(0);
})