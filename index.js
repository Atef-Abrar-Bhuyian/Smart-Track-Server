require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.68dnu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const userCollection = client.db("smartTrack").collection("users");
    const assetsCollection = client.db("smartTrack").collection("assets");
    const teamCollection = client.db("smartTrack").collection("teams");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after vefiry token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "HR";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    // users related api

    // hr related api's

    // Admin Check
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      // Ensure token email matches the request email
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "HR";

      res.send({ admin: isAdmin });
    });

    // Admin user Info
    app.get("/adminInfo/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      // Ensure token email matches the request email
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    // Users Get
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Users Post
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already Exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // User info with in a team or not
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });

      if (user.role === "HR") {
        return res.send(user);
      } else {
        // Convert user._id to a string
        const userIdStr = user?._id.toString();

        // Find the team where the user's ID matches an employee_id
        const team = await teamCollection.findOne({
          "employees.employee_id": userIdStr,
        });

        if (team) {
          user.team = "in-a-team";
        } else {
          user.team = "not-in-team";
        }

        return res.send(user);
      }
    });

    // pending 5 request for hr home page
    app.get(
      "/pendingRequestsForHr/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const hrEmail = req.params.email;

        try {
          // Ensure token email matches the request email
          if (hrEmail !== req.decoded.email) {
            return res.status(403).send({ message: "Forbidden Access" });
          }

          // Use aggregation to fetch exactly 5 pending requests across all assets
          const pendingRequests = await assetsCollection
            .aggregate([
              {
                $match: {
                  hrEmail: hrEmail,
                },
              },
              {
                $unwind: "$requests",
              },
              {
                $match: {
                  "requests.status": "Pending",
                },
              },
              {
                $limit: 5,
              },
              {
                $project: {
                  productName: 1,
                  quantity: 1,
                  productType: 1,
                  assetAddedDate: 1,
                  hrEmail: 1,
                  "requests.userEmail": 1,
                  "requests.userName": 1,
                  "requests.requestedDate": 1,
                  "requests.status": 1,
                },
              },
            ])
            .toArray();

          res.send(pendingRequests);
        } catch (error) {
          // console.error("Error fetching pending requests for HR:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    // top most Requested items
    app.get(
      "/topRequestedItems/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const hrEmail = req.params.email;

          // Ensure token email matches the request email
          if (hrEmail !== req.decoded.email) {
            return res.status(403).send({ message: "Forbidden Access" });
          }

          const topRequestedItems = await assetsCollection
            .aggregate([
              {
                $match: {
                  hrEmail: hrEmail,
                },
              },
              {
                $unwind: "$requests",
              },
              {
                $group: {
                  _id: "$productName",
                  totalRequests: { $sum: 1 },
                },
              },
              {
                $sort: {
                  totalRequests: -1,
                },
              },
              {
                $limit: 4,
              },
            ])
            .toArray();

          res.send(topRequestedItems);
        } catch (error) {
          // console.error("Error fetching top requested items:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    // limited Stock Items
    app.get(
      "/limitedStockItems/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const hrEmail = req.params.email;
        try {
          const limitedStockItems = await assetsCollection
            .find({
              hrEmail: hrEmail,
              quantity: { $lt: 10 },
            })
            .toArray();

          res.send(limitedStockItems);
        } catch (error) {
          // console.error("Error fetching limited stock items:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    // Hr Pie Chart
    app.get(
      "/itemRequestStats/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const hrEmail = req.params.email;

          // Ensure token email matches the request email
          if (hrEmail !== req.decoded.email) {
            return res.status(403).send({ message: "Forbidden Access" });
          }

          const itemRequestStats = await assetsCollection
            .aggregate([
              {
                $match: {
                  hrEmail: hrEmail,
                },
              },
              {
                $unwind: "$requests",
              },
              {
                $group: {
                  _id: "$productType",
                  totalRequests: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  productType: "$_id",
                  totalRequests: 1,
                },
              },
            ])
            .toArray();

          const totalRequests = itemRequestStats.reduce(
            (acc, item) => acc + item.totalRequests,
            0
          );

          const pieChartData = itemRequestStats.map((item) => ({
            productType: item.productType,
            percentage: parseInt(
              ((item.totalRequests / totalRequests) * 100).toFixed(2)
            ),
          }));

          res.send(pieChartData);
        } catch (error) {
          // console.error("Error fetching item request stats:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    // update User Info
    app.patch("/usersUpdate/:email", async (req, res) => {
      const { email } = req.params;
      const { name, photo } = req.body;

      const user = await userCollection.findOne({ email });

      const updateInfo = {
        $set: {
          name: name || user?.name,
          photo: photo || user?.photo,
        },
      };

      const result = await userCollection.updateOne({ email }, updateInfo);
      res.send(result);
    });

    // Pending Request of an Employee
    app.get("/pendingRequests/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;

      const user = await userCollection.findOne({ email: userEmail });
      const teamsInfo = await teamCollection.findOne({
        "employees.employee_id": user?._id.toString(),
      });

      const pendingRequests = await assetsCollection
        .find({
          hrEmail: teamsInfo?.hrEmail,
          requests: {
            $elemMatch: {
              userEmail: userEmail,
              status: "Pending",
            },
          },
        })
        .toArray();

      res.send(pendingRequests);
    });

    // All request of employee of this month
    app.get("/allRequestsOfOneMonth/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      const user = await userCollection.findOne({ email: userEmail });
      const teamsInfo = await teamCollection.findOne({
        "employees.employee_id": user?._id.toString(),
      });

      // Get the start and end of the current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(startOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);

      const pendingRequests = await assetsCollection
        .find({
          hrEmail: teamsInfo?.hrEmail,
          "requests.userEmail": userEmail,
          "requests.requestedDate": {
            $gte: startOfMonth, // Greater than or equal to the start of the month
            $lt: endOfMonth, // Less than the end of the month
          },
        })
        .toArray();

      res.send(pendingRequests);
    });

    // Assets Post
    app.post("/assets", verifyToken, verifyAdmin, async (req, res) => {
      const asset = req.body;
      const email = asset?.hrEmail;

      // checkign token email and user email same or not
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = {
        hrEmail: asset?.hrEmail,
        productName: asset?.productName,
      };
      const existingAsset = await assetsCollection.findOne(query);
      if (existingAsset) {
        return res.send({ message: "Asset Already Exists", insertedId: null });
      }
      const result = await assetsCollection.insertOne(asset);
      res.send(result);
    });

    // Assets Get
    app.get(
      "/assetsList/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const hrEmail = req.params.email;

        // checkign token email and user email same or not
        if (hrEmail !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const query = { hrEmail: hrEmail };
        const result = await assetsCollection.find(query).toArray();
        res.send(result);
      }
    );

    // Hr asset list page search functionality
    app.get("/searchAssetHr/:email", verifyToken, async (req, res) => {
      const hrEmail = req.params.email;
      const { productName } = req.query;

      try {
        const query = {
          productName: { $regex: productName, $options: "i" },
          hrEmail: hrEmail,
        };

        const assets = await assetsCollection.find(query).toArray();

        const hrDetails = await userCollection
          .find({ email: hrEmail })
          .project({ email: 1, companyName: 1 })
          .toArray();

        const result = assets.map((asset) => {
          const hr = hrDetails.find((hr) => hr.email === asset.hrEmail);
          return { ...asset, companyName: hr?.companyName };
        });

        // Send the result back to the client
        res.status(200).send(result);
      } catch (err) {
        // console.error("Error searching for assets:", err);
        res.status(500).send({ message: "Internal server error." });
      }
    });

    // filter hr asset list page
    app.get("/requestAssetsFilter/:email", verifyToken, async (req, res) => {
      const hrEmail = req.params.email;
      const { filterType } = req.query;

      try {
        let query = { hrEmail: hrEmail };

        if (filterType) {
          if (filterType === "available") {
            query["quantity"] = { $gt: 0 };
          } else if (filterType === "outOfStock") {
            query["quantity"] = { $eq: 0 };
          } else if (filterType === "Returnable") {
            query["productType"] = "Returnable";
          } else if (filterType === "Non-Returnable") {
            query["productType"] = "Non-Returnable";
          } else {
            return res.status(400).send({ message: "Invalid filter type." });
          }
        }

        const assets = await assetsCollection.find(query).toArray();

        if (assets.length === 0) {
          return res.status(200).send([]);
        }

        const hrEmails = assets.map((asset) => asset.hrEmail);

        const hrDetails = await userCollection
          .find({ email: { $in: hrEmails } })
          .project({ email: 1, companyName: 1 })
          .toArray();

        const result = assets.map((asset) => {
          const hr = hrDetails.find((hr) => hr.email === asset.hrEmail);
          return { ...asset, companyName: hr?.companyName };
        });

        res.status(200).send(result);
      } catch (err) {
        // console.error("Error filtering assets:", err);
        res.status(500).send({ message: "Internal server error." });
      }
    });

    // Hr Asset List Sort
    app.get("/assetListSort/:email", verifyToken, async (req, res) => {
      const hrEmail = req.params.email;
      const { filterType } = req.query;

      const order = filterType === "desc" ? -1 : 1;
      const query = { hrEmail: hrEmail };

      const assets = await assetsCollection
        .find(query)
        .sort({ quantity: order })
        .toArray();

      res.status(200).send(assets);
    });

    app.patch("/assetsList/:id", verifyToken, verifyAdmin, async (req, res) => {
      const assetId = req.params.id;
      const { hrEmail, quantity } = req.body;

      if (hrEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = { _id: new ObjectId(assetId), hrEmail: hrEmail };
      const update = { $set: { quantity: parseInt(quantity) } };

      const result = await assetsCollection.updateOne(query, update);

      res.send(result);
    });

    // Asset Request Approved
    app.patch(
      "/assetRequestAccept/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;

        // checkign token email and user email same or not
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const { assetId, requestId } = req.body;

        const query = {
          _id: new ObjectId(assetId),
          "requests._id": new ObjectId(requestId),
        };

        const update = {
          $set: {
            "requests.$.status": "Approved",
            "requests.$.approvaldDate": new Date(),
          },
          $inc: {
            quantity: -1,
          },
        };

        const result = await assetsCollection.updateOne(query, update);

        res.send(result);
      }
    );

    // Asset Request Reject
    app.patch(
      "/assetRequestReject/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;

        // checkign token email and user email same or not
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const { assetId, requestId } = req.body;

        const query = {
          _id: new ObjectId(assetId),
          "requests._id": new ObjectId(requestId),
        };

        const update = {
          $set: {
            "requests.$.status": "Rejected",
          },
        };

        const result = await assetsCollection.updateOne(query, update);

        res.send(result);
      }
    );

    // employees not in team
    app.get("/usersNotInTeam", verifyToken, async (req, res) => {
      // Fetch all users
      const allUsers = await userCollection.find().toArray();

      // Fetch all employee_ids from the teamCollection using aggregation
      const teams = await teamCollection
        .aggregate([
          { $unwind: "$employees" },
          { $project: { "employees.employee_id": 1 } },
        ])
        .toArray();
      // Extract employee_ids
      const teamMemberIds = teams.map((team) => team.employees?.employee_id);

      // Filter users who are not in any team and do not have the role 'HR'
      const usersNotInTeam = allUsers.filter(
        (user) =>
          !teamMemberIds.includes(user._id.toString()) && user.role !== "HR"
      );

      // Send the filtered users
      res.send(usersNotInTeam);
    });

    // employee add in team
    app.post("/addToTeam", verifyToken, verifyAdmin, async (req, res) => {
      const { employee_id, hrEmail, employeeName, employeePhoto } = req.body;

      // checkign token email and user email same or not
      if (hrEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = { email: hrEmail };
      const hrInfo = userCollection.find(query);
      const hrPackage = await hrInfo
        .map((package) => package.selectedPackage)
        .toArray();

      const packageValue = hrPackage[0];

      // Check if the HR already exists in the database
      const existingHRTeam = await teamCollection.findOne({ hrEmail });

      if (
        (packageValue === "basic" && existingHRTeam?.employees.length >= 5) ||
        (packageValue === "advance" &&
          existingHRTeam?.employees.length >= 10) ||
        (packageValue === "ultimate" && existingHRTeam?.employees.length >= 20)
      ) {
        return res.status(400).send({ message: "limit reached" });
      }

      // If HR team does not exist, create a new team and add the employee
      const result = await teamCollection.insertOne({
        hrEmail,
        employees: [{ employee_id, employeeName, employeePhoto }],
      });

      res
        .status(200)
        .send({ message: "Successfully Added", insertedId: result.insertedId });
    });

    // Multiple employee add to team
    app.post(
      "/addMultipleEmployeeTeam",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { employees, hrEmail } = req.body;

        if (hrEmail !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const query = { email: hrEmail };
        const hrInfo = await userCollection.find(query).toArray();
        const packageValue = hrInfo[0]?.selectedPackage;

        const existingHRTeam = await teamCollection.findOne({ hrEmail });

        if (
          (packageValue === "basic" && existingHRTeam?.employees.length >= 5) ||
          (packageValue === "advance" &&
            existingHRTeam?.employees.length >= 10) ||
          (packageValue === "ultimate" &&
            existingHRTeam?.employees.length >= 20)
        ) {
          return res.status(400).send({ message: "limit reached" });
        }

        const existingTeam = await teamCollection.findOne({
          "employees.employee_id": {
            $in: employees.map((emp) => emp.employee_id),
          },
        });

        if (existingTeam) {
          return res
            .status(400)
            .send({ message: "Some employees are already in a team" });
        }

        if (existingHRTeam) {
          await teamCollection.updateOne(
            { hrEmail },
            { $push: { employees: { $each: employees } } }
          );
        } else {
          await teamCollection.insertOne({ hrEmail, employees });
        }

        // Return success response
        res
          .status(200)
          .send({ message: "Successfully Added", insertedIds: true });
      }
    );

    // get my team's employees
    app.get("/myTeam/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      // checkign token email and user email same or not
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const query = { hrEmail: email };
      const result = await teamCollection.find(query).toArray();
      res.send(result);
    });

    // Delete an employee from team
    app.delete("/myTeam/:email", verifyToken, verifyAdmin, async (req, res) => {
      const userEmail = req.params.email;

      // checkign token email and user email same or not
      if (userEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const { deleteUserId } = req.body;
      const query = { "employees.employee_id": deleteUserId };
      const update = { $pull: { employees: { employee_id: deleteUserId } } };

      const result = await teamCollection.updateOne(query, update);
      res.send(result);
    });

    // Delete an Asset
    app.delete(
      "/assetsList/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const userEmail = req.params.email;

        // checkign token email and user email same or not
        if (userEmail !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const { id } = req.body;
        const query = { _id: new ObjectId(id) };
        const result = await assetsCollection.deleteOne(query);
        res.send(result);
      }
    );

    // payment related api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to create PaymentIntent" });
      }
    });

    // employee realed api's
    // employee team with hr info
    app.get("/emplyeeTeam/:email", verifyToken, async (req, res) => {
      const employeeEmail = req.params.email;

      const employee = await userCollection.findOne({ email: employeeEmail });

      const team = await teamCollection.findOne({
        "employees.employee_id": employee._id.toString(),
      });

      if (!team) {
        // If no team is found for this employee, return an error
        return res.status(404).send({
          success: false,
          message: "no-team-found",
        });
      }

      const hrUser = await userCollection.findOne({ email: team?.hrEmail });

      res.send({
        success: true,
        team,
        hrUser,
      });
    });

    // assets for teammembers
    app.get("/hrAssets/:email", verifyToken, async (req, res) => {
      const employeeEmail = req.params.email;
      const employee = await userCollection.findOne({ email: employeeEmail });

      const team = await teamCollection.findOne({
        "employees.employee_id": employee._id.toString(),
      });

      if (!team) {
        return res
          .status(404)
          .send({ success: false, message: "no-team-found" });
      }

      const hrUser = await userCollection.findOne({ email: team?.hrEmail });

      const hrAssets = await assetsCollection
        .find({ hrEmail: hrUser?.email })
        .toArray();

      res.send(hrAssets);
    });

    // req an assets
    app.post("/requestAnAsset", verifyToken, async (req, res) => {
      const requestInfo = req.body;
      const query = { _id: new ObjectId(requestInfo.assetsId) };
      const asset = await assetsCollection.findOne(query);

      const userRequest = {
        _id: new ObjectId(),
        userEmail: requestInfo?.userEmail,
        userName: requestInfo?.userName,
        status: requestInfo?.status,
        requestedDate: new Date(),
        message: requestInfo?.message,
      };

      const update = {
        $push: {
          requests: userRequest,
        },
      };

      const result = await assetsCollection.updateOne(query, update);
      res.status(200).send(result);
    });

    // Search for employee requested assets by product name
    app.get("/searchAsset/:email", verifyToken, async (req, res) => {
      const employeeEmail = req.params.email;
      const { productName } = req.query;

      try {
        const query = {
          "requests.userEmail": employeeEmail,
          productName: { $regex: productName, $options: "i" },
        };

        const assets = await assetsCollection.find(query).toArray();

        const hrEmails = assets?.map((asset) => asset?.hrEmail);

        const hrDetails = await userCollection
          .find({ email: { $in: hrEmails } })
          .project({ email: 1, companyName: 1 })
          .toArray();

        const result = assets.map((asset) => {
          const hr = hrDetails.find((hr) => hr.email === asset?.hrEmail);
          return { ...asset, companyName: hr?.companyName };
        });

        // Send the result back to the client
        res.status(200).send(result);
      } catch (err) {
        // console.error("Error searching for assets:", err);
        res.status(500).send({ message: "Internal server error." });
      }
    });

    // Filter Employee assets request
    app.get("/assetsRequestFilter/:email", verifyToken, async (req, res) => {
      const employeeEmail = req.params.email;
      const { filterType } = req.query;
      try {
        let query = { "requests.userEmail": employeeEmail };

        if (filterType) {
          if (filterType === "Pending") {
            query["requests.status"] = "Pending";
          } else if (filterType === "Approved") {
            query["requests.status"] = "Approved";
          } else if (filterType === "Returnable") {
            query["productType"] = "Returnable";
          } else if (filterType === "Non-Returnable") {
            query["productType"] = "Non-Returnable";
          } else {
            return res.status(400).send({ message: "Invalid filter type." });
          }
        }

        const assets = await assetsCollection.find(query).toArray();

        if (assets.length === 0) {
          return res.status(200).send([]);
        }

        const hrEmails = assets.map((asset) => asset.hrEmail);

        const hrDetails = await userCollection
          .find({ email: { $in: hrEmails } })
          .project({ email: 1, companyName: 1 })
          .toArray();

        const result = assets.map((asset) => {
          const hr = hrDetails.find((hr) => hr.email === asset.hrEmail);
          return { ...asset, companyName: hr?.companyName };
        });

        res.status(200).send(result);
      } catch (err) {
        // console.error("Error filtering assets:", err);
        res.status(500).send({ message: "Internal server error." });
      }
    });

    // filter employee request page
    app.get("/requestAssetsFilter/:email", verifyToken, async (req, res) => {
      const employeeEmail = req.params.email;
      const { filterType } = req.query;

      try {
        let query = { "requests.userEmail": employeeEmail };

        if (filterType) {
          if (filterType === "available") {
            query["quantity"] = { $gt: 0 };
          } else if (filterType === "outOfStock") {
            query["quantity"] = { $eq: 0 };
          } else if (filterType === "Returnable") {
            query["productType"] = "Returnable";
          } else if (filterType === "Non-Returnable") {
            query["productType"] = "Non-Returnable";
          } else {
            return res.status(400).send({ message: "Invalid filter type." });
          }
        }

        const assets = await assetsCollection.find(query).toArray();

        if (assets.length === 0) {
          return res.status(200).send([]);
        }

        const hrEmails = assets.map((asset) => asset.hrEmail);

        const hrDetails = await userCollection
          .find({ email: { $in: hrEmails } })
          .project({ email: 1, companyName: 1 })
          .toArray();

        const result = assets.map((asset) => {
          const hr = hrDetails.find((hr) => hr.email === asset.hrEmail);
          return { ...asset, companyName: hr?.companyName };
        });

        res.status(200).send(result);
      } catch (err) {
        // console.error("Error filtering assets:", err);
        res.status(500).send({ message: "Internal server error." });
      }
    });

    // employee requsted assets
    app.get("/employeesAssets/:email", verifyToken, async (req, res) => {
      const employeeEmail = req.params.email;
      const query = { "requests.userEmail": employeeEmail };
      const assets = await assetsCollection.find(query).toArray();

      const hrEmails = assets.map((asset) => asset.hrEmail);

      const hrDetails = await userCollection
        .find({ email: { $in: hrEmails } })
        .project({ email: 1, companyName: 1 })
        .toArray();

      const result = assets.map((asset) => {
        const hr = hrDetails.find((hr) => hr.email === asset?.hrEmail);
        return { ...asset, companyName: hr?.companyName };
      });

      res.send(result);
    });

    // Employee cancel an asset
    app.delete("/deleteRequest", verifyToken, async (req, res) => {
      const { requestId, assetId } = req.body;

      const query = { _id: new ObjectId(assetId) };
      const update = {
        $pull: {
          requests: { _id: new ObjectId(requestId) },
        },
      };

      const result = await assetsCollection.updateOne(query, update);
      res.status(200).send(result);
    });

    // return asset
    app.patch("/returnAsset", verifyToken, async (req, res) => {
      const { assetId, requestId } = req.body;

      const query = {
        _id: new ObjectId(assetId),
        "requests._id": new ObjectId(requestId),
      };
      const update = {
        $set: {
          "requests.$.status": "Returned",
        },
        $inc: {
          quantity: 1,
        },
      };

      const result = await assetsCollection.updateOne(query, update);

      res.send(result);
    });

    // limit Increase and user selected plane update
    app.patch("/increaseLimit/:email", async (req, res) => {
      const { email } = req.params;
      const { selectedPackage } = req.body;

      const result = await userCollection.updateOne(
        { email: email },
        { $set: { selectedPackage: selectedPackage } }
      );

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("SmartTrack Server is Running");
});

app.listen(port, () => {
  console.log(`SmartTrack Server is Running on Port: ${port}`);
});
