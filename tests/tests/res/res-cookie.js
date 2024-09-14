// must support res.cookie()

import express from "express";

const app = express();

app.get('/test', (req, res) => {
    res.cookie('test', '1');
    res.cookie('test2', '2', { maxAge: 1000 });
    res.cookie('test3', '3', { maxAge: 1000, path: '/test' });
    res.cookie('test4', '4', { maxAge: 1000, path: '/test', httpOnly: true });
    res.cookie('test5', '5', { maxAge: 1000, path: '/test', secure: true });
    res.send('test');
});

app.listen(13333, async () => {
    console.log('Server is running on port 13333');

    const response = await fetch('http://localhost:13333/test');
    console.log(response.headers.get('Set-Cookie').replace(/\d\d\:\d\d\:\d\d/g, 'xx:xx:xx'));
    process.exit(0);
});