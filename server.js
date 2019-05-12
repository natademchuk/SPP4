const express = require('express');
const app = express();
app.set("view engine", "ejs");

const server = require('http').createServer(app);
const io = require('socket.io')(server);

const fileUpload = require('express-fileupload');
app.use(fileUpload());

const siofu = require("socketio-file-upload");
app.use(siofu.router);

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
app.use(cookieParser());

app.use('/public', express.static('public'));

let utasks = []; //данные всех задач для конкретного пользователя
let SECRET;

const fs = require('fs');
let users = []; //данные всех пользователей {username:" ",password:" "}
let tasks = []; //данные всех задач для каждого пользователя {username:" ", utasks:[]}
let tempUsername = "";

function updateTasks(username, utasks) {
    let idx = tasks.findIndex(x => x.username === username);
    tasks.splice(idx, 1, { username, utasks });
}

function getUTasks(username) {
    utasks = tasks.find(x => x.username === username).utasks.slice();
}

let verifyToken = function(req, res, next) {
    const token = req.cookies.token;
    jwt.verify(token, SECRET, function(err, decoded) {
        if (err) {
            res.status(401);
            next();
        }
    });
    res.status(200);
    next();
};

let register = function(data) {
    const saltRounds = 10;
    bcrypt.hash(data.uPassword, saltRounds).then(function(hash) {
        users.push({ userName: data.uName, userPassword: hash });
    });
    tasks.push({ username: data.uName, utasks: [] });
};
let login = function(data, socket) {
    tempUsername = data.uName;
    getUTasks(data.uName);
    SECRET = Date.now().toString();
    let userInfo = { userName: data.uName, userPassword: data.uPassword };
    const token = jwt.sign({ userName: userInfo.userName, userPassword: userInfo.userPassword }, SECRET);
    socket.emit("succss", { token: token });
};

app.get('/register', verifyToken, function(req, res) {
    // res.status(200);
    res.render("autorisation", { title: "REGISTRATION", header: "Registration ", action: "Register" });
    console.log('get /register success');
});

io.of('/register').on("connection", function(socket) {
    socket.on("register", (data) => {
        if (users.findIndex(x => x.userName === data.uName) >= 0) {
            socket.emit("err", { msg: "Your username already exists." }); //user exists
        } else {
            register(data);
            login(data, socket);
        }
    });
});

app.get('/login', verifyToken, function(req, res) {
    // res.status(200);
    res.render("autorisation", { title: "LOGIN", header: "Welcome back ! ", action: "Login" });
    console.log('get /login success');
});

io.of('/login').on("connection", function(socket) {
    socket.on("login", (data) => {
        if (users.findIndex(x => x.userName === data.uName) < 0) {
            socket.emit("err", { msg: "Your username does not exist." }); //user doesn't exist
        } else {
            bcrypt.compare(data.uPassword, users.find(x => x.userName === data.uName).userPassword).then(function(cmpres) {
                if (cmpres)
                    login(data, socket);
                else
                    socket.emit("err", { msg: "Your username and password do not match." }); //wrong password
            });
        }
    });
});

app.get('/', verifyToken, function(req, res) {
    res.render("index", { utasks });
    console.log('get / success');
});

io.on("connection", function(socket) {
    let uploader = new siofu();
    uploader.dir = __dirname + '/public/downloadfiles/';
    uploader.listen(socket);
    let filename = "";
    uploader.on("start", function(event) {
        event.file.name = event.file.name.split(' ').join('_');
    });
    uploader.on("progress", function(event) {
        filename = event.file.name;
        filename = filename.replace(filename.slice(0, filename.indexOf(".")), event.file.base);
    });
    uploader.on("error", function(event) {
        console.log("Error from uploader", event);
    });
    socket.on("add", (data) => {
        let temptask = createTempTask(data);
        utasks.push(temptask);
        updateTasks(tempUsername, utasks);
        socket.emit("add_success", { data: temptask });
    });
    socket.on("update", (data) => {
        let temptask = createTempTask(data);
        utasks.splice(data.tasknum, 1, temptask);
        updateTasks(tempUsername, utasks);
        socket.emit("update_success", { data: temptask });
    });

    function createTempTask(data) {
        let temptask = {
            task: data.task,
            status: data.status,
            efdate: data.fdate,
            filename: filename,
            filepath: '/public/downloadfiles/' + filename
        };
        return temptask;
    }
});

process.on('SIGINT', (code) => {
    let usersdata = JSON.stringify(users, null, 2);
    let tasksdata = JSON.stringify(tasks, null, 2);
    fs.writeFile(__dirname + '/bd/users_bd.json', usersdata, (err) => {
        if (err) throw err;
    });
    fs.writeFile(__dirname + '/bd/tasks_bd.json', tasksdata, (err) => {
        if (err) throw err;
    });
    server.close(() =>
        console.log("server.js exit")
    );
});

server.listen(8000, function() {
    fs.readFile(__dirname + '/bd/users_bd.json', (err, data) => {
        if (err) throw err;
        try {
            users = JSON.parse(data);
        } catch (e) {
            users = [];
        }
    });
    fs.readFile(__dirname + '/bd/tasks_bd.json', (err, data) => {
        if (err) throw err;
        try {
            tasks = JSON.parse(data);
        } catch (e) {
            tasks = [];
        }
    });
    console.log('server.js listening on port 8000!');
});