// must support simple "use"

import express from "express";

const app = express();

app.use((req, res, next) => {
    console.log('use 1');
    next();
});

app.use('/', (req, res, next) => {
    console.log('use 2');
    next();
});

app.use('/tes', (req, res, next) => {
    console.log('use 3');
    next();
});

app.use('/test', (req, res, next) => {
    console.log('use 4');
    next();
});

app.get('/test', (req, res) => {
    res.send('test');
});

app.use('/asdf', (req, res, next) => {
    console.log('use 5');
    next();
});

app.get('/asdf/asdf', (req, res) => {
    res.send('asdf');
});

app.listen(13333, async () => {
    console.log('Server is running on port 13333');

    let output1 = await fetch('http://localhost:13333/test').then(res => res.text());
    let output2 = await fetch('http://localhost:13333/asdf/asdf').then(res => res.text());

    console.log(output1, output2);
    process.exit(0);
});