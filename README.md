# Smart Track Server

The Smart Track Server provides the backend for managing assets and user requests for the Smart Track web application. It uses Node.js, Express, MongoDB, and Firebase for user authentication and data storage.

## Features

- **Asset Management**: CRUD operations for assets (add, update, delete, fetch).
- **Request Management**: HR approves/rejects employee asset requests.
- **User Management**: Firebase authentication for secure login and team management and send to Database.

## Technologies

- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **Authentication**: Firebase
- **Payment**: Stripe
- **Libraries**: Mongoose, Stripe, dotenv, cors, body-parser

## API Endpoints

- **GET `/assets`**: Get all assets.
- **POST `/assets`**: Add an asset.
- **PUT `/assets/:id`**: Update an asset.
- **DELETE `/assets/:id`**: Delete an asset.
- **GET `/requests`**: Get all asset requests.
- **POST `/requests`**: Create a request.
- **PUT `/requests/:id/approve`**: Approve a request.
- **PUT `/requests/:id/reject`**: Reject a request.
- **POST `/users`**: Add a user.
- **POST `/login`**: User login.

## npm Packages Used

- `express`: Web framework.
- `mongoose`: MongoDB ODM.
- `firebase-admin`: Firebase authentication.
- `stripe`: Payment gateway.
- `dotenv`: Environment variables.
- `cors`: Cross-origin requests.
- `jsonwebtoken`: JWT for user authentication.

## Live Server

- [Smart Track API](https://smarttrackserver.vercel.app/)
