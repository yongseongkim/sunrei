# Recommendation System for Animation and Drama Locations

This project is a NestJS-based backend application designed to provide recommendations for locations featured in popular animations and dramas. It allows users to create, retrieve, and manage recommendations and locations through a RESTful API.

## Project Structure

```
server
├── src
│   ├── app.module.ts
│   ├── main.ts
│   ├── modules
│   │   ├── recommendations
│   │   │   ├── recommendations.controller.ts
│   │   │   ├── recommendations.service.ts
│   │   │   ├── recommendations.module.ts
│   │   │   └── dto
│   │   │       └── create-recommendation.dto.ts
│   │   ├── locations
│   │   │   ├── locations.controller.ts
│   │   │   ├── locations.service.ts
│   │   │   ├── locations.module.ts
│   │   │   └── dto
│   │   │       └── create-location.dto.ts
│   │   └── users
│   │       ├── users.controller.ts
│   │       ├── users.service.ts
│   │       ├── users.module.ts
│   │       └── dto
│   │           └── create-user.dto.ts
│   └── common
│       ├── filters
│       │   └── http-exception.filter.ts
│       ├── interceptors
│       │   └── logging.interceptor.ts
│       └── pipes
│           └── validation.pipe.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Features

- **Recommendations Module**: Handles the creation and management of recommendations for locations in animations and dramas.
- **Locations Module**: Manages the locations that can be recommended, including their details.
- **Users Module**: Manages user accounts and their interactions with the recommendations and locations.
- **Common Utilities**: Includes filters, interceptors, and pipes for handling exceptions, logging, and validation.

## Getting Started

1. **Clone the repository**:
   ```
   git clone <repository-url>
   cd server
   ```

2. **Install dependencies**:
   ```
   npm install
   ```

3. **Run the application**:
   ```
   npm run start
   ```

4. **Access the API**: The application will be running on `http://localhost:3000`.

## API Endpoints

- **Recommendations**:
  - `GET /recommendations`: Retrieve all recommendations.
  - `POST /recommendations`: Create a new recommendation.
  - `DELETE /recommendations/:id`: Delete a recommendation by ID.

- **Locations**:
  - `GET /locations`: Retrieve all locations.
  - `POST /locations`: Create a new location.
  - `DELETE /locations/:id`: Delete a location by ID.

- **Users**:
  - `GET /users`: Retrieve all users.
  - `POST /users`: Create a new user.
  - `DELETE /users/:id`: Delete a user by ID.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.