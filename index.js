import pg from "pg";
import bodyParser from "body-parser";
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import path from 'path';
import ejs from "ejs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = 3000;
const db = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});
try {
  db.connect();
} catch (err) {
  console.log(err);
}


app.engine('ejs', ejs.renderFile);  // Register the EJS engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("viewengine", "ejs");

let users =[]; 
async function users_fill() {
  const respond = await db.query("select * from users");
  users = respond.rows;   
}

let error;
let currentUser;
let userBooks;

async function user_books(sort) {
  let respond = await db.query(`select ub.note, ub.year, ub.rate, title, books.id, author from books
                                join users_books as ub on ub.user_id = $1
                                where ub.book_id = books.id order by ${sort} desc`, [currentUser.id]);
  userBooks = respond.rows; // array of objects
} 

app.get("/", async(req, res)=> {
  await users_fill() 
  res.render("index.ejs", {users: users});
});
 
app.get("/new", (req,res)=> {
  res.render("addUser.ejs", {users: users}); 
}); 
app.post("/bookNote", async(req, res)=> {
  try {
    await db.query(`update users_books
                    set rate =$1,
                    year =$2,
                    note = $3
                    where user_id =$4 and book_id =$5`, [req.body.rate, req.body.year, req.body.note, parseInt(req.body.idUser), parseInt(req.body.currentBook)]);
  } catch (err) {
    console.log(err);
  }
  res.redirect("/user");
});

app.post("/user", async(req,res)=> {
  if (req.body.addBookId) { // coming from adding a book
    try {
      await db.query("insert into books (id, title, author) values ($1, $2, $3)", [parseInt(req.body.addBookId), req.body.addBookTitle, req.body.addBookAuthor]);
    } catch (err) { // exists in general books table
      console.log(err);
    }
    try {
      await db.query("insert into users_books (book_id, user_id) values ($1, $2)", [parseInt(req.body.addBookId), parseInt(currentUser.id)]);
    } catch (err) { // book already is in this user books .. already handled in front-end to not happen 
       console.log(err);
    }

    try {
    const respond = await db.query("insert into users (name, color) values ($1, $2) returning id",[req.body.name, req.body.color]);
    currentUser = {id: respond.rows[0].id, name: req.body.name, color: req.body.color};
    } catch (err) {
      if (currentUser) {
        error = "name already exists";
      } else {
        error = "name is too long";        
      }
    }
  } // neither is from /delbook 
  res.redirect('/user');
});

app.get("/user",async (req,res)=> { // to redirect to /user
  await users_fill();
  if (req.query.userId) { // defined if coming from selecting user
    currentUser = users.find(user=> user.id == req.query.userId); //ID in query is string, currentUser is an object {id int, name, color}
  }

  try {
    if (req.query.sort === "year" || req.query.sort === "rate") { // make sure input value is as expected
      await user_books(req.query.sort);
    } else {
      await user_books("ub.id"); // default sorting .. based on recently added
    }
  } catch (err) {
    console.log(err);
  }
  res.render("index.ejs", {currentUser: currentUser, users: users, userBooks: userBooks, error: error});
});

app.get("/books", async (req,res)=> { 
  try {
    let result = await axios.get(`https://openlibrary.org/search.json`, { 
      params: {title: req.query.title}
    });
    let books = result.data.docs.filter(book=> book.cover_i !== undefined);
    res.render("books.ejs", {books: books, numFound: books.length, users: users, currentUser: currentUser, userBooks: userBooks});
  }catch (err){
    console.log(err);
    res.redirect("/user"); 
  }
});

app.post("/delUser",async (req, res)=> {
  try {
    await db.query(`delete from users_books
                  where user_id = $1;`,
                  [parseInt(req.body.deleteUser)]);
    await db.query(`delete from users
                    where id = $1;`, [req.body.deleteUser]);
  } catch (err) {
    console.log(err);
  }
  res.redirect("/");
});

app.post("/delBook", async(req, res)=> {
  await db.query(`delete from users_books
                where book_id = $1 and user_id = $2`, [req.body.deleteBook, req.body.userId]);
  res.redirect("/user");
});
app.listen(port, ()=> {
    console.log(`listening on port ${port}`); 
});