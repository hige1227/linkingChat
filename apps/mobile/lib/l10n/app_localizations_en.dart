// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'LinkingChat';

  @override
  String get chats => 'Chats';

  @override
  String get contacts => 'Contacts';

  @override
  String get devices => 'Devices';

  @override
  String get profile => 'Profile';

  @override
  String get settings => 'Settings';

  @override
  String get nickname => 'Nickname';

  @override
  String get username => 'Username';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get status => 'Status';

  @override
  String get online => 'Online';

  @override
  String get idle => 'Idle';

  @override
  String get doNotDisturb => 'Do Not Disturb';

  @override
  String get offline => 'Offline';

  @override
  String get editNickname => 'Edit Nickname';

  @override
  String get save => 'Save';

  @override
  String get cancel => 'Cancel';

  @override
  String get confirm => 'Confirm';

  @override
  String get login => 'Login';

  @override
  String get logout => 'Log Out';

  @override
  String get logoutConfirm => 'Are you sure you want to log out?';

  @override
  String get loading => 'Loading...';

  @override
  String get loadFailed => 'Load failed';

  @override
  String get retry => 'Retry';

  @override
  String get sendMessage => 'Type a message...';

  @override
  String get search => 'Search';

  @override
  String get searchMessages => 'Search messages';

  @override
  String get noResults => 'No results';

  @override
  String get recalledOwn => 'You recalled a message';

  @override
  String get recalledOther => 'A message was recalled';

  @override
  String get copy => 'Copy';

  @override
  String get recall => 'Recall';

  @override
  String get recallExpired => 'Recall time expired';

  @override
  String get selectPhoto => 'Take Photo';

  @override
  String get selectFromGallery => 'Choose from Gallery';

  @override
  String get changeAvatar => 'Change Avatar';

  @override
  String get avatarUpdated => 'Avatar updated';

  @override
  String get avatarUploadFailed => 'Avatar upload failed';

  @override
  String get forgotPassword => 'Forgot password?';

  @override
  String get sendVerificationCode => 'Send Verification Code';

  @override
  String get resetPassword => 'Reset Password';

  @override
  String get newPassword => 'New Password';

  @override
  String get confirmPassword => 'Confirm Password';

  @override
  String get verificationCode => 'Verification Code';

  @override
  String codeSentTo(String email) {
    return 'Code sent to $email';
  }

  @override
  String get passwordResetSuccess =>
      'Password reset successfully. Please log in.';

  @override
  String get language => 'Language';

  @override
  String get startConversation => 'Start a conversation';

  @override
  String get verifyEmail => 'Verify Email';

  @override
  String get checkVerificationEmail => 'Check your verification email';

  @override
  String get verificationCodeSent => 'We sent a 6-digit code to your email';

  @override
  String get enterVerificationCode => 'Enter verification code';

  @override
  String get resend => 'Resend';

  @override
  String resendIn(int seconds) {
    return 'Resend (${seconds}s)';
  }

  @override
  String get verificationSuccess => 'Email verified!';

  @override
  String get verificationEmailResent => 'Verification email resent';

  @override
  String get addFriend => 'Add Friend';

  @override
  String get friendRequests => 'Friend Requests';

  @override
  String get noFriends => 'No friends yet';

  @override
  String get accept => 'Accept';

  @override
  String get reject => 'Reject';

  @override
  String get groupMembers => 'Group Members';

  @override
  String get createGroup => 'Create Group';

  @override
  String get groupName => 'Group Name';

  @override
  String get description => 'Description';

  @override
  String version(String version) {
    return 'LinkingChat v$version';
  }
}
