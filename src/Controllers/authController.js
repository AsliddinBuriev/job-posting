import catchAsyncErr from '../utils/catchAsyncErr.js';
import User from './../Models/userSchema.js';
import { sign, verify } from '../utils/jwt.js';
import MakeError from './../utils/MakeError.js';
import sendMail from './../utils/mail.js';
import crypto from 'crypto';

/******** SIGN UP *******/
export const signup = catchAsyncErr(async (req, res, next) => {
  //1.create user
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    lastPwChanged: req.body.lastPwChanged,
  });
  //2.create token
  const token = await sign({ id: newUser._id });
  //3.send response
  res.status(201).json({
    status: 'success',
    token,
    data: {
      user: newUser,
    },
  });
});

/********  LOG IN *******/
export const login = catchAsyncErr(async (req, res, next) => {
  const { email, password } = req.body;
  //1. check if the password and email is posted
  if (!email || !password)
    return next(new MakeError('Please provide your email and password!', 400));

  //2. check if the user exists && password is correct
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.isPasswordCorrect(password, user.password)))
    return next(new MakeError('Email or password is wrong!', 401));

  //3. create token
  const token = await sign({ id: user._id });
  //4. send response
  res.status(201).json({
    status: 'success',
    token,
  });
});

/********  UPDATE PASSWORD *******/
export const updatePassword = catchAsyncErr(async (req, res, next) => {
  //get the current user
  const user = await User.findById(req.user._id).select('+password');
  //2. check user password
  if (!(await user.isPasswordCorrect(req.body.oldPassword, user.password)))
    return next(new MakeError('Your password is not correct', 401));
  //3. update password
  user.password = req.body.newPassword;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  //4. login again
  const token = await sign({ id: user._id });
  res.status(200).json({
    status: 'success',
    token,
  });
});

/******** PROTECT *******/
export const protect = catchAsyncErr(async (req, res, next) => {
  //1.check if token exists in req.headers
  const { authorization } = req.headers;
  let token;
  if (authorization && authorization.startsWith('Bearer'))
    token = authorization.split(' ')[1];
  if (!token) next(new MakeError('You are not logged in.', 401));

  //2. verify jwt token
  const decoded = await verify(token);

  //3. check if user still exists
  const loggedUser = await User.findById(decoded.id);
  if (!loggedUser)
    return next(new MakeError('The user no longer exists.', 401));

  //4. check if the user changed password
  if (loggedUser.isPasswordChanged(decoded.iat))
    return next(
      new MakeError('Password has been changed. Please log in again.', 401)
    );
  req.user = loggedUser;
  next();
});

/******** FORGOT PASSWORD  *******/
export const forgotPassword = catchAsyncErr(async (req, res, next) => {
  //1. Get user based on email
  const user = await User.findOne({ email: req.body.email });
  if (!user)
    return next(new MakeError(`There is no account with this email!`, 400));

  //2. Generate the random reset token with crypto module, encrypt and save token into db
  const token = await user.generateResetPwToken();
  await user.save({ validateBeforeSave: false });

  // 3. Send it to user's email along with a url
  try {
    await sendMail({
      email: user.email,
      subject: 'Reset your password!',
      text: `Please go the url to reset your password: ${req.protocol}://${req.hostname}/api/v1/user/reset-password/${token}\nThe url is valid for 10 minutes!`,
    });
  } catch (err) {
    user.pwResetToken = undefined;
    user.pwResetTokenExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new MakeError(
        'There was an error sending the email. Please try again!',
        500
      )
    );
  }

  res.status(200).json({
    status: 'success',
    message: `Reset password url is sent to your email!`,
  });
});

/******** PASSWORD RESET *******/
export const resetPassword = catchAsyncErr(async (req, res, next) => {
  //1. Get user based on token
  const pwResetToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    pwResetToken: pwResetToken,
    pwResetTokenExpire: { $gt: Date.now() },
  });
  //2. If token is not expired and user is exist, update the user password
  if (!user)
    return next(
      new MakeError('Your token is invalid or expired. Please try again!', 400)
    );

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.pwResetToken = undefined;
  user.pwResetTokenExpire = undefined;
  await user.save();

  //4. create jwt token and log the user in
  const token = await sign({ id: user._id });
  res.status(200).json({
    status: 'success',
    message: 'You are logged in with your new password!',
    token,
  });
});