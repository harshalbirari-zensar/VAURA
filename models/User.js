import { DataTypes } from 'sequelize';
import sequelize from '../sequelizeConfig.js';

// User Login Details Model - Maps to rbac_UserLoginDetails table
const User = sequelize.define('rbac_UserLoginDetails', {
  ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'ID'
  },
  UserName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'UserName'
  },
  Password: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'Password'
  },
  FirstName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'FirstName'
  },
  LastName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'LastName'
  },
  Email: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'Email',
    validate: {
      isEmail: true
    }
  },
  PhoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'PhoneNumber'
  },
  Department: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'Department'
  },
  Role: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'Role'
  },
  Status: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'Active',
    field: 'Status'
  },
  LastLogin: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'LastLogin'
  },
  ActiveSessions: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'ActiveSessions'
  },
  CreatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'CreatedAt'
  },
  UpdatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'UpdatedAt'
  }
}, {
  tableName: 'rbac_UserLoginDetails',
  timestamps: false
});

// Instance methods
User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.Password; // Don't expose password in JSON
  return values;
};

// Class methods
User.findByUsername = async function(username) {
  return await this.findOne({ where: { UserName: username } });
};

User.getActiveUsers = async function() {
  return await this.findAll({ 
    where: { Status: 'Active' },
    order: [['LastLogin', 'DESC']]
  });
};

User.getUsersByDepartment = async function(department) {
  return await this.findAll({ 
    where: { Department: department },
    order: [['LastName', 'ASC']]
  });
};

export default User;
