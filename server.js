const app = require('express')();

app.get('/', (req, res) => {
    res.sendFile("synth.html", {root: "./"});
});

app.get('/built/*', (req, res) => {
    res.sendFile(req.url, {root: "./"});
});

app.get('*', (req, res) => {
    console.log(req.url);
    res.sendFile(req.url, {root: "./"});
});

app.listen(8080, () => {
    console.log("server opened at localhost:8080");
});