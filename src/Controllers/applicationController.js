import catchAsyncErr from '../utils/catchAsyncErr.js';
import MakeError from '../utils/MakeError.js';
import Application from './../Models/applicationSchema.js';
import Job from './../Models/jobSchema.js';
import sendResponse from '../utils/sendResponse.js';

/******** APPLY FOR A JOB  *******/
export const applyForJob = catchAsyncErr(async (req, res, next) => {
  //check if the job exists
  const job = await Job.findById(req.params.jobId);
  if (!job)
    return next(
      new MakeError('The job you want to apply does not exist!', 400)
    );
  //check if job was not posted by the applicant
  if (job.postedBy.toString() === req.user._id.toString()) {
    return next(
      new MakeError('You cannot apply for the job posted by yourself!', 400)
    );
  }
  // check if current user has not applied before
  req.body.job = req.params.jobId;
  req.body.applicant = req.user._id;
  const application = await Application.create(req.body);
  //send response
  sendResponse(res, {
    statusCode: 200,
    data: null,
    message: 'Application sent!',
  });
});
