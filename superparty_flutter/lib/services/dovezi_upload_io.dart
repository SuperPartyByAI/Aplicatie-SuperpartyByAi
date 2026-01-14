import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

Future<TaskSnapshot> putXFile(
  Reference ref,
  XFile file, {
  SettableMetadata? metadata,
}) async {
  return ref.putFile(File(file.path), metadata).whenComplete(() {});
}

