from httmock import urlmatch, HTTMock
import pytest
import unittest
import requests
from brca import settings


settings.MAILCHIMP_URL = 'https://mailchimp.com'
settings.MAILCHIMP_KEY = '12345'
settings.MAILCHIMP_LIST = '12345'


@urlmatch(netloc=r'(.*\.)?mailchimp\.com$')
def google_mock(url, request):
    return 'Feeling lucky, punk?'


class TestStringMethods(unittest.TestCase):

    def test_get(self):
        with HTTMock(google_mock):
            r = requests.get('http://mailchimp.com/')
            self.assertEqual(r.content, 'Feeling lucky, punk?')
